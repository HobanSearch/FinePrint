import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Document Upload Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should display upload interface', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    await expect(page.locator('[data-testid="upload-modal"]')).toBeVisible();
    await expect(page.locator('input[type="file"]')).toBeVisible();
    await expect(page.locator('[data-testid="paste-text-tab"]')).toBeVisible();
    await expect(page.locator('[data-testid="url-input-tab"]')).toBeVisible();
  });

  test('should upload PDF file successfully', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    // Create a test PDF file path (assuming test file exists)
    const testFile = path.join(__dirname, '../fixtures/test-contract.pdf');
    
    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(testFile);
    
    // Fill document details
    await page.fill('[data-testid="document-title"]', 'Test Contract PDF');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    
    // Submit upload
    await page.click('[data-testid="upload-submit"]');
    
    // Should show upload progress
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    
    // Should redirect to document view after upload
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/);
    await expect(page.locator('[data-testid="document-title"]')).toContainText('Test Contract PDF');
  });

  test('should paste text content successfully', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    await page.click('[data-testid="paste-text-tab"]');
    
    const testContent = `
      SOFTWARE LICENSE AGREEMENT
      
      This Software License Agreement ("Agreement") is entered into between
      Company ("Licensor") and Customer ("Licensee").
      
      1. GRANT OF LICENSE
      Subject to the terms and conditions of this Agreement, Licensor hereby 
      grants to Licensee a non-exclusive, non-transferable license to use 
      the Software.
      
      2. LIMITATIONS
      Licensee shall not modify, distribute, or reverse engineer the Software.
      
      3. LIABILITY
      Company shall not be liable for any damages arising from use of the Software.
    `;
    
    await page.fill('[data-testid="text-content"]', testContent);
    await page.fill('[data-testid="document-title"]', 'Test Pasted Contract');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    
    await page.click('[data-testid="upload-submit"]');
    
    // Should process the text and redirect
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/);
    await expect(page.locator('[data-testid="document-content"]')).toContainText('SOFTWARE LICENSE AGREEMENT');
  });

  test('should analyze document from URL', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    await page.click('[data-testid="url-input-tab"]');
    
    const testUrl = 'https://example.com/privacy-policy';
    
    await page.fill('[data-testid="document-url"]', testUrl);
    await page.fill('[data-testid="document-title"]', 'Example Privacy Policy');
    await page.selectOption('[data-testid="document-type"]', 'privacy-policy');
    
    await page.click('[data-testid="upload-submit"]');
    
    // Should show URL processing indicator
    await expect(page.locator('[data-testid="url-processing"]')).toBeVisible();
    
    // Should eventually redirect to document view
    await expect(page).toHaveURL(/\/documents\/[a-f0-9-]+/, { timeout: 30000 });
  });

  test('should validate file size limits', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    // Mock large file upload
    await page.route('/api/upload', (route) => {
      route.fulfill({
        status: 413,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'File too large',
          message: 'File size exceeds 10MB limit'
        })
      });
    });
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/large-file.pdf'));
    
    await page.fill('[data-testid="document-title"]', 'Large File Test');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    await page.click('[data-testid="upload-submit"]');
    
    // Should show file size error
    await expect(page.locator('[data-testid="error-message"]')).toContainText('File size exceeds 10MB limit');
  });

  test('should validate supported file types', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    // Try to upload unsupported file type
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/unsupported.exe'));
    
    // Should show file type error immediately
    await expect(page.locator('[data-testid="file-type-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="file-type-error"]')).toContainText('Unsupported file type');
  });

  test('should require document title', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    await page.click('[data-testid="paste-text-tab"]');
    
    await page.fill('[data-testid="text-content"]', 'Some test content');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    
    // Try to submit without title
    await page.click('[data-testid="upload-submit"]');
    
    // Should show validation error
    await expect(page.locator('[data-testid="title-required-error"]')).toBeVisible();
  });

  test('should auto-suggest document type based on content', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    await page.click('[data-testid="paste-text-tab"]');
    
    const privacyPolicyContent = `
      PRIVACY POLICY
      
      This Privacy Policy describes how we collect, use, and disclose
      your personal information when you use our service.
      
      Information We Collect
      We collect information you provide directly to us, such as when
      you create an account or contact us.
    `;
    
    await page.fill('[data-testid="text-content"]', privacyPolicyContent);
    await page.fill('[data-testid="document-title"]', 'Privacy Policy');
    
    // Should auto-detect document type
    await expect(page.locator('[data-testid="document-type"]')).toHaveValue('privacy-policy');
  });

  test('should show upload progress for large files', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    // Mock upload with progress
    await page.route('/api/upload', async (route) => {
      // Simulate slow upload
      await new Promise(resolve => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-doc-id',
          title: 'Test Document',
          status: 'uploaded'
        })
      });
    });
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-contract.pdf'));
    
    await page.fill('[data-testid="document-title"]', 'Progress Test');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    await page.click('[data-testid="upload-submit"]');
    
    // Should show progress bar
    await expect(page.locator('[data-testid="upload-progress"]')).toBeVisible();
    await expect(page.locator('[data-testid="progress-percentage"]')).toBeVisible();
  });

  test('should handle upload cancellation', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-contract.pdf'));
    
    await page.fill('[data-testid="document-title"]', 'Cancel Test');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    await page.click('[data-testid="upload-submit"]');
    
    // Cancel upload
    await page.click('[data-testid="cancel-upload"]');
    
    // Should hide progress and return to upload form
    await expect(page.locator('[data-testid="upload-progress"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="upload-form"]')).toBeVisible();
  });

  test('should handle network errors during upload', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    // Simulate network error
    await page.route('/api/upload', (route) => {
      route.abort('failed');
    });
    
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/test-contract.pdf'));
    
    await page.fill('[data-testid="document-title"]', 'Network Error Test');
    await page.selectOption('[data-testid="document-type"]', 'contract');
    await page.click('[data-testid="upload-submit"]');
    
    // Should show network error
    await expect(page.locator('[data-testid="upload-error"]')).toContainText('Upload failed');
    await expect(page.locator('[data-testid="retry-upload"]')).toBeVisible();
  });

  test('should support drag and drop upload', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    
    const dropZone = page.locator('[data-testid="drop-zone"]');
    await expect(dropZone).toBeVisible();
    
    // Simulate file drop
    const testFile = path.join(__dirname, '../fixtures/test-contract.pdf');
    await dropZone.setInputFiles(testFile);
    
    // Should populate file info
    await expect(page.locator('[data-testid="file-name"]')).toContainText('test-contract.pdf');
    await expect(page.locator('[data-testid="file-size"]')).toBeVisible();
  });

  test('should close upload modal on cancel', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    await expect(page.locator('[data-testid="upload-modal"]')).toBeVisible();
    
    await page.click('[data-testid="cancel-button"]');
    await expect(page.locator('[data-testid="upload-modal"]')).not.toBeVisible();
  });

  test('should close upload modal on escape key', async ({ page }) => {
    await page.click('[data-testid="upload-document-button"]');
    await expect(page.locator('[data-testid="upload-modal"]')).toBeVisible();
    
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-testid="upload-modal"]')).not.toBeVisible();
  });
});
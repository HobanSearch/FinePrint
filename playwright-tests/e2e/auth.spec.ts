import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // No auth state

  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page).toHaveTitle(/Fine Print AI/);
    await expect(page.locator('h1')).toContainText('Sign In');
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');
    
    // Fill login form
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Invalid credentials');
  });

  test('should validate email format', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'invalid-email');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should show validation error
    await expect(page.locator('input[type="email"]:invalid')).toBeVisible();
  });

  test('should require password', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    // Should show required field validation
    await expect(page.locator('input[type="password"]:invalid')).toBeVisible();
  });

  test('should navigate to registration page', async ({ page }) => {
    await page.goto('/login');
    
    await page.click('[data-testid="register-link"]');
    await expect(page).toHaveURL('/register');
    await expect(page.locator('h1')).toContainText('Create Account');
  });

  test('should register new user', async ({ page }) => {
    await page.goto('/register');
    
    const timestamp = Date.now();
    const email = `test-${timestamp}@example.com`;
    
    // Fill registration form
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[type="email"]', email);
    await page.fill('input[type="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'password123');
    
    // Submit form
    await page.click('button[type="submit"]');
    
    // Should redirect to dashboard after successful registration
    await expect(page).toHaveURL('/dashboard');
  });

  test('should validate password confirmation', async ({ page }) => {
    await page.goto('/register');
    
    await page.fill('input[name="firstName"]', 'Test');
    await page.fill('input[name="lastName"]', 'User');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.fill('input[name="confirmPassword"]', 'different-password');
    
    await page.click('button[type="submit"]');
    
    // Should show password mismatch error
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Passwords do not match');
  });

  test('should handle logout', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // Open user menu and logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Should redirect to login page
    await expect(page).toHaveURL('/login');
    
    // Should not be able to access protected routes
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login');
  });

  test('should redirect to dashboard if already logged in', async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Try to visit login page again
    await page.goto('/login');
    
    // Should redirect to dashboard
    await expect(page).toHaveURL('/dashboard');
  });

  test('should show loading state during login', async ({ page }) => {
    await page.goto('/login');
    
    // Intercept login request to add delay
    await page.route('/api/auth/login', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.continue();
    });
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    
    const submitButton = page.locator('button[type="submit"]');
    await submitButton.click();
    
    // Should show loading state
    await expect(submitButton).toBeDisabled();
    await expect(page.locator('[data-testid="loading-spinner"]')).toBeVisible();
  });

  test('should handle network errors gracefully', async ({ page }) => {
    await page.goto('/login');
    
    // Simulate network error
    await page.route('/api/auth/login', (route) => {
      route.abort('failed');
    });
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    // Should show network error message
    await expect(page.locator('[data-testid="error-message"]')).toContainText('Network error');
  });

  test('should remember login state across browser refresh', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@example.com');
    await page.fill('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    await expect(page).toHaveURL('/dashboard');
    
    // Refresh page
    await page.reload();
    
    // Should still be logged in
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('[data-testid="user-menu"]')).toBeVisible();
  });

  test('should handle forgotten password flow', async ({ page }) => {
    await page.goto('/login');
    
    await page.click('[data-testid="forgot-password-link"]');
    await expect(page).toHaveURL('/forgot-password');
    
    await page.fill('input[type="email"]', 'test@example.com');
    await page.click('button[type="submit"]');
    
    // Should show success message
    await expect(page.locator('[data-testid="success-message"]')).toContainText('Password reset email sent');
  });
});
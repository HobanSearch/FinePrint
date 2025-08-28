import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DocumentUpload } from '../upload/DocumentUpload';

// Mock hooks and utilities
vi.mock('@/hooks/queries/analysis', () => ({
  useCreateDocument: vi.fn(),
  useCreateAnalysis: vi.fn()
}));

vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn()
  }
}));

// Mock file upload utilities
vi.mock('@/lib/utils', () => ({
  cn: vi.fn((...classes) => classes.filter(Boolean).join(' ')),
  formatFileSize: vi.fn((bytes) => `${bytes} bytes`),
  validateFileType: vi.fn((file) => ({ isValid: true, error: null }))
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false }
    }
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

describe('DocumentUpload', () => {
  let mockCreateDocument: any;
  let mockCreateAnalysis: any;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    
    // Setup default mocks
    mockCreateDocument = {
      mutate: vi.fn(),
      isLoading: false,
      error: null
    };

    mockCreateAnalysis = {
      mutate: vi.fn(),
      isLoading: false,
      error: null
    };

    const { useCreateDocument, useCreateAnalysis } = require('@/hooks/queries/analysis');
    useCreateDocument.mockReturnValue(mockCreateDocument);
    useCreateAnalysis.mockReturnValue(mockCreateAnalysis);

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Initial Render', () => {
    test('should render upload interface with all tabs', () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Upload Document')).toBeInTheDocument();
      
      // Check tabs
      expect(screen.getByRole('tab', { name: /file upload/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /paste text/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /from url/i })).toBeInTheDocument();
    });

    test('should have file upload tab active by default', () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const fileUploadTab = screen.getByRole('tab', { name: /file upload/i });
      expect(fileUploadTab).toHaveAttribute('aria-selected', 'true');
      
      expect(screen.getByTestId('file-upload-zone')).toBeInTheDocument();
    });

    test('should render form fields', () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      expect(screen.getByLabelText(/document title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /upload/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    });
  });

  describe('File Upload Tab', () => {
    test('should handle file selection', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);

      await user.upload(fileInput, file);

      expect(screen.getByText('test.pdf')).toBeInTheDocument();
      expect(screen.getByText(/pdf/i)).toBeInTheDocument();
    });

    test('should validate file types', async () => {
      const { validateFileType } = require('@/lib/utils');
      validateFileType.mockReturnValue({ 
        isValid: false, 
        error: 'File type not supported' 
      });

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'test.exe', { type: 'application/x-executable' });
      const fileInput = screen.getByLabelText(/choose file/i);

      await user.upload(fileInput, file);

      expect(screen.getByText('File type not supported')).toBeInTheDocument();
    });

    test('should handle drag and drop', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const dropZone = screen.getByTestId('file-upload-zone');
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });

      // Simulate drag enter
      fireEvent.dragEnter(dropZone, {
        dataTransfer: {
          files: [file],
          types: ['Files']
        }
      });

      expect(dropZone).toHaveClass('border-blue-500');

      // Simulate drop
      fireEvent.drop(dropZone, {
        dataTransfer: {
          files: [file]
        }
      });

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });
    });

    test('should show upload progress', async () => {
      mockCreateDocument.isLoading = true;

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'Test Document');
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByTestId('upload-progress')).toBeInTheDocument();
      expect(uploadButton).toBeDisabled();
    });
  });

  describe('Paste Text Tab', () => {
    test('should switch to paste text tab', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const pasteTab = screen.getByRole('tab', { name: /paste text/i });
      await user.click(pasteTab);

      expect(pasteTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByLabelText(/document content/i)).toBeInTheDocument();
    });

    test('should handle text content input', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const pasteTab = screen.getByRole('tab', { name: /paste text/i });
      await user.click(pasteTab);

      const textArea = screen.getByLabelText(/document content/i);
      const testContent = 'This is a test contract with liability clauses.';
      
      await user.type(textArea, testContent);

      expect(textArea).toHaveValue(testContent);
    });

    test('should auto-detect document type from content', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const pasteTab = screen.getByRole('tab', { name: /paste text/i });
      await user.click(pasteTab);

      const textArea = screen.getByLabelText(/document content/i);
      const privacyContent = 'PRIVACY POLICY\n\nWe collect your personal information...';
      
      await user.type(textArea, privacyContent);

      // Should auto-select privacy-policy type
      await waitFor(() => {
        const typeSelect = screen.getByLabelText(/document type/i);
        expect(typeSelect).toHaveValue('privacy-policy');
      });
    });

    test('should validate minimum content length', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const pasteTab = screen.getByRole('tab', { name: /paste text/i });
      await user.click(pasteTab);

      const textArea = screen.getByLabelText(/document content/i);
      await user.type(textArea, 'Too short');
      await user.type(screen.getByLabelText(/document title/i), 'Test');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByText(/content too short/i)).toBeInTheDocument();
    });
  });

  describe('URL Tab', () => {
    test('should switch to URL tab', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const urlTab = screen.getByRole('tab', { name: /from url/i });
      await user.click(urlTab);

      expect(urlTab).toHaveAttribute('aria-selected', 'true');
      expect(screen.getByLabelText(/document url/i)).toBeInTheDocument();
    });

    test('should validate URL format', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const urlTab = screen.getByRole('tab', { name: /from url/i });
      await user.click(urlTab);

      const urlInput = screen.getByLabelText(/document url/i);
      await user.type(urlInput, 'invalid-url');
      await user.type(screen.getByLabelText(/document title/i), 'Test');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByText(/invalid url/i)).toBeInTheDocument();
    });

    test('should handle URL content fetching', async () => {
      const { apiClient } = require('@/lib/api-client');
      apiClient.post.mockResolvedValue({
        data: {
          content: 'Fetched content from URL',
          title: 'Auto-generated title'
        }
      });

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const urlTab = screen.getByRole('tab', { name: /from url/i });
      await user.click(urlTab);

      const urlInput = screen.getByLabelText(/document url/i);
      await user.type(urlInput, 'https://example.com/privacy-policy');
      await user.type(screen.getByLabelText(/document title/i), 'Privacy Policy');
      await user.selectOptions(screen.getByLabelText(/document type/i), 'privacy-policy');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(apiClient.post).toHaveBeenCalledWith('/api/documents/fetch-url', {
        url: 'https://example.com/privacy-policy'
      });
    });
  });

  describe('Form Validation', () => {
    test('should require document title', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByText(/title is required/i)).toBeInTheDocument();
    });

    test('should require document type', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'Test Document');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByText(/document type is required/i)).toBeInTheDocument();
    });

    test('should validate title length', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'A'.repeat(201)); // Too long
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByText(/title too long/i)).toBeInTheDocument();
    });
  });

  describe('Upload Process', () => {
    test('should upload file and create document', async () => {
      mockCreateDocument.mutate.mockImplementation((data, { onSuccess }) => {
        onSuccess({ id: 'doc-123', title: data.title });
      });

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'Test Contract');
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(mockCreateDocument.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Contract',
          documentType: 'contract',
          file: file
        }),
        expect.any(Object)
      );
    });

    test('should start analysis after document upload', async () => {
      mockCreateDocument.mutate.mockImplementation((data, { onSuccess }) => {
        onSuccess({ id: 'doc-123', title: data.title });
      });

      mockCreateAnalysis.mutate.mockImplementation((data, { onSuccess }) => {
        onSuccess({ id: 'analysis-123', status: 'pending' });
      });

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'Test Contract');
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(mockCreateAnalysis.mutate).toHaveBeenCalledWith(
          expect.objectContaining({
            documentId: 'doc-123'
          }),
          expect.any(Object)
        );
      });
    });

    test('should handle upload errors', async () => {
      mockCreateDocument.error = new Error('Upload failed');

      render(<DocumentUpload />, { wrapper: createWrapper() });

      expect(screen.getByText('Upload failed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });

    test('should handle network errors', async () => {
      mockCreateDocument.mutate.mockImplementation((data, { onError }) => {
        onError(new Error('Network error'));
      });

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      await waitFor(() => {
        expect(screen.getByText(/network error/i)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    test('should have proper ARIA labels', () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-labelledby');
      expect(screen.getByLabelText(/document title/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/document type/i)).toBeInTheDocument();
    });

    test('should handle keyboard navigation', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const titleInput = screen.getByLabelText(/document title/i);
      titleInput.focus();

      // Tab to next element
      await user.tab();
      expect(screen.getByLabelText(/document type/i)).toHaveFocus();

      // Shift+Tab back
      await user.tab({ shift: true });
      expect(titleInput).toHaveFocus();
    });

    test('should close modal on Escape key', async () => {
      const onClose = vi.fn();
      render(<DocumentUpload onClose={onClose} />, { wrapper: createWrapper() });

      await user.keyboard('{Escape}');
      expect(onClose).toHaveBeenCalled();
    });

    test('should announce upload progress to screen readers', async () => {
      mockCreateDocument.isLoading = true;

      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);
      await user.type(screen.getByLabelText(/document title/i), 'Test');
      await user.selectOptions(screen.getByLabelText(/document type/i), 'contract');
      
      const uploadButton = screen.getByRole('button', { name: /upload/i });
      await user.click(uploadButton);

      expect(screen.getByRole('status')).toHaveTextContent(/uploading/i);
    });
  });

  describe('Performance', () => {
    test('should debounce auto-detection', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const pasteTab = screen.getByRole('tab', { name: /paste text/i });
      await user.click(pasteTab);

      const textArea = screen.getByLabelText(/document content/i);
      
      // Type quickly
      await user.type(textArea, 'PRIVACY');
      await user.type(textArea, ' POLICY');

      // Auto-detection should be debounced
      await waitFor(() => {
        const typeSelect = screen.getByLabelText(/document type/i);
        expect(typeSelect).toHaveValue('privacy-policy');
      }, { timeout: 1000 });
    });

    test('should handle large file uploads', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      // Create a large file (5MB)
      const largeContent = 'x'.repeat(5 * 1024 * 1024);
      const largeFile = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
      
      const fileInput = screen.getByLabelText(/choose file/i);
      await user.upload(fileInput, largeFile);

      expect(screen.getByText('large.pdf')).toBeInTheDocument();
      expect(screen.getByText(/5242880 bytes/)).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    test('should handle empty file', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const emptyFile = new File([''], 'empty.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, emptyFile);

      expect(screen.getByText(/file is empty/i)).toBeInTheDocument();
    });

    test('should handle special characters in filename', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file = new File(['test'], 'contract (v1.2) - final.pdf', { type: 'application/pdf' });
      const fileInput = screen.getByLabelText(/choose file/i);
      
      await user.upload(fileInput, file);

      expect(screen.getByText('contract (v1.2) - final.pdf')).toBeInTheDocument();
    });

    test('should handle concurrent uploads', async () => {
      render(<DocumentUpload />, { wrapper: createWrapper() });

      const file1 = new File(['test1'], 'test1.pdf', { type: 'application/pdf' });
      const file2 = new File(['test2'], 'test2.pdf', { type: 'application/pdf' });
      
      const fileInput = screen.getByLabelText(/choose file/i);
      
      // Upload first file
      await user.upload(fileInput, file1);
      
      // Immediately upload second file (should replace first)
      await user.upload(fileInput, file2);

      expect(screen.getByText('test2.pdf')).toBeInTheDocument();
      expect(screen.queryByText('test1.pdf')).not.toBeInTheDocument();
    });
  });
});
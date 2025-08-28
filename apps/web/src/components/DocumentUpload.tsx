import React, { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { useForm, Controller } from 'react-hook-form'
import { motion } from 'framer-motion'
import { 
  DocumentIcon, 
  CloudArrowUpIcon, 
  XMarkIcon,
  ExclamationTriangleIcon 
} from '@heroicons/react/24/outline'
import toast from 'react-hot-toast'
import { apiClient } from '../services/api'
import clsx from 'clsx'

interface UploadFormData {
  uploadType: 'file' | 'text' | 'url'
  text?: string
  url?: string
  documentType: 'tos' | 'privacy' | 'contract' | 'agreement'
}

interface DocumentUploadProps {
  onAnalysisStart: (analysisId: string) => void
  isLoading?: boolean
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onAnalysisStart, isLoading = false }) => {
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  
  const { control, handleSubmit, watch, setValue, formState: { errors } } = useForm<UploadFormData>({
    defaultValues: {
      uploadType: 'file',
      documentType: 'tos'
    }
  })

  const uploadType = watch('uploadType')

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0]
    if (file) {
      setUploadedFile(file)
      setValue('uploadType', 'file')
    }
  }, [setValue])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'text/plain': ['.txt'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/html': ['.html', '.htm']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    onDropRejected: (files) => {
      const file = files[0]
      if (file) {
        if (file.file.size > 50 * 1024 * 1024) {
          toast.error('File size must be less than 50MB')
        } else {
          toast.error('File type not supported. Please upload PDF, TXT, DOC, DOCX, or HTML files.')
        }
      }
    }
  })

  const removeFile = () => {
    setUploadedFile(null)
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const validateUrl = (url: string): boolean => {
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const onSubmit = async (formData: UploadFormData) => {
    setIsUploading(true)
    
    try {
      let analysisData: any = {
        documentType: formData.documentType
      }

      if (formData.uploadType === 'file' && uploadedFile) {
        // Upload file first, then analyze the uploaded text content
        const uploadResult = await apiClient.uploadDocument(uploadedFile)
        toast.success('File uploaded successfully!')
        
        // For now, since API doesn't support documentId analysis, 
        // we'll ask user to copy-paste the content for analysis
        toast.error('File upload successful, but automatic analysis from files is not yet supported. Please copy the text content and use "Paste Text" option.')
        return
        
      } else if (formData.uploadType === 'text' && formData.text) {
        analysisData.text = formData.text
      } else if (formData.uploadType === 'url' && formData.url) {
        if (!validateUrl(formData.url)) {
          toast.error('Please enter a valid URL starting with http:// or https://')
          return
        }
        analysisData.url = formData.url
      } else {
        toast.error('Please provide content to analyze')
        return
      }

      // Start analysis
      const analysisJob = await apiClient.startAnalysis(analysisData)
      toast.success('Analysis started!')
      
      onAnalysisStart(analysisJob.id)
      
      // Reset form
      setUploadedFile(null)
      setValue('text', '')
      setValue('url', '')
      
    } catch (error: any) {
      console.error('Upload/Analysis error:', error)
      const errorMessage = error.message || error.response?.data?.error || 'Failed to start analysis'
      toast.error(errorMessage)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl mx-auto p-6">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* Upload Type Selection */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">How would you like to provide content?</h3>
          
          <Controller
            name="uploadType"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-4">
                {[
                  { value: 'file', label: 'Upload File', icon: DocumentIcon },
                  { value: 'text', label: 'Paste Text', icon: CloudArrowUpIcon },
                  { value: 'url', label: 'Website URL', icon: ExclamationTriangleIcon },
                ].map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => field.onChange(value)}
                    className={clsx(
                      'p-4 rounded-lg border-2 transition-all duration-200 flex flex-col items-center space-y-2',
                      field.value === value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-700'
                    )}
                  >
                    <Icon className="w-6 h-6" />
                    <span className="text-sm font-medium">{label}</span>
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* Document Type Selection */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-gray-900">What type of document is this?</h3>
          
          <Controller
            name="documentType"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { value: 'tos', label: 'Terms of Service', description: 'Terms & conditions, user agreements' },
                  { value: 'privacy', label: 'Privacy Policy', description: 'Data collection & usage policies' },
                  { value: 'contract', label: 'Contract', description: 'Legal contracts & agreements' },
                  { value: 'agreement', label: 'Other Agreement', description: 'Other legal documents' },
                ].map(({ value, label, description }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => field.onChange(value)}
                    className={clsx(
                      'p-4 rounded-lg border-2 transition-all duration-200 text-left',
                      field.value === value
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-700'
                    )}
                  >
                    <div className="font-medium text-sm">{label}</div>
                    <div className="text-xs mt-1 opacity-75">{description}</div>
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* File Upload */}
        {uploadType === 'file' && (
          <div className="space-y-4">
            {!uploadedFile ? (
              <div
                {...getRootProps()}
                className={clsx(
                  'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                  isDragActive
                    ? 'border-primary-400 bg-primary-50'
                    : 'border-gray-300 hover:border-gray-400'
                )}
              >
                <input {...getInputProps()} />
                <CloudArrowUpIcon className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-lg font-medium text-gray-600 mb-2">
                  {isDragActive ? 'Drop the file here' : 'Drag & drop a file here'}
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  or <span className="text-primary-600 font-medium">browse files</span>
                </p>
                <p className="text-xs text-gray-400">
                  Supports PDF, TXT, DOC, DOCX, HTML (up to 50MB)
                </p>
              </div>
            ) : (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="border border-gray-200 rounded-lg p-4 bg-gray-50"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <DocumentIcon className="w-8 h-8 text-primary-600" />
                    <div>
                      <p className="font-medium text-gray-900">{uploadedFile.name}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(uploadedFile.size)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={removeFile}
                    className="p-1 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    <XMarkIcon className="w-5 h-5 text-gray-500" />
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Text Input */}
        {uploadType === 'text' && (
          <div>
            <label htmlFor="text" className="block text-sm font-medium text-gray-700 mb-2">
              Paste Terms of Service or Privacy Policy Text
            </label>
            <Controller
              name="text"
              control={control}
              rules={{ required: uploadType === 'text' ? 'Please enter text to analyze' : false }}
              render={({ field }) => (
                <textarea
                  {...field}
                  id="text"
                  rows={8}
                  className={clsx(
                    'input resize-none',
                    errors.text && 'border-red-300 focus-visible:ring-red-500'
                  )}
                  placeholder="Paste the legal document text here..."
                />
              )}
            />
            {errors.text && (
              <p className="mt-1 text-sm text-red-600">{errors.text.message}</p>
            )}
          </div>
        )}

        {/* URL Input */}
        {uploadType === 'url' && (
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-gray-700 mb-2">
              Website URL
            </label>
            <Controller
              name="url"
              control={control}
              rules={{ 
                required: uploadType === 'url' ? 'Please enter a URL' : false,
                pattern: {
                  value: /^https?:\/\/.+/,
                  message: 'Please enter a valid URL starting with http:// or https://'
                }
              }}
              render={({ field }) => (
                <input
                  {...field}
                  id="url"
                  type="url"
                  className={clsx(
                    'input',
                    errors.url && 'border-red-300 focus-visible:ring-red-500'
                  )}
                  placeholder="https://example.com/terms-of-service"
                />
              )}
            />
            {errors.url && (
              <p className="mt-1 text-sm text-red-600">{errors.url.message}</p>
            )}
            <p className="mt-1 text-xs text-gray-500">
              We'll extract the terms of service from this website
            </p>
          </div>
        )}

        {/* Submit Button */}
        <motion.button
          type="submit"
          disabled={isUploading || isLoading}
          className={clsx(
            'w-full btn-primary py-3 px-6 text-base font-medium',
            (isUploading || isLoading) && 'opacity-50 cursor-not-allowed'
          )}
          whileHover={{ scale: isUploading || isLoading ? 1 : 1.02 }}
          whileTap={{ scale: isUploading || isLoading ? 1 : 0.98 }}
        >
          {isUploading ? (
            <div className="flex items-center justify-center space-x-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>Starting Analysis...</span>
            </div>
          ) : (
            'Start Analysis'
          )}
        </motion.button>
      </form>
    </div>
  )
}

export default DocumentUpload
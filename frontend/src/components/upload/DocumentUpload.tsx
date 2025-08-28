import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDropzone } from 'react-dropzone'
import { 
  Upload, 
  File, 
  Link, 
  Type, 
  Mail,
  Check,
  X,
  AlertCircle,
  Loader2,
  FileText,
  Image,
  Archive,
  Globe
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Progress } from '@/components/ui/Progress'
import { cn, formatBytes } from '@/lib/utils'
import { ANIMATION_VARIANTS } from '@/lib/constants'

export interface UploadFile {
  id: string
  file: File
  status: 'uploading' | 'processing' | 'completed' | 'error'
  progress: number
  error?: string
  preview?: {
    type: string
    content: string
  }
}

export interface DocumentUploadProps {
  onFilesAdded?: (files: File[]) => void
  onTextSubmitted?: (text: string) => void
  onUrlSubmitted?: (url: string) => void
  onEmailSetup?: () => void
  maxFiles?: number
  maxFileSize?: number // in bytes
  acceptedFileTypes?: string[]
  className?: string
}

const uploadMethods = [
  {
    id: 'file',
    label: 'Upload File',
    description: 'PDF, DOCX, TXT files',
    icon: File,
    primary: true,
  },
  {
    id: 'url',
    label: 'From URL',
    description: 'Terms page or document link',
    icon: Globe,
  },
  {
    id: 'text',
    label: 'Paste Text',
    description: 'Copy and paste directly',
    icon: Type,
  },
  {
    id: 'email',
    label: 'Email Forward',
    description: 'Send to your unique address',
    icon: Mail,
  },
]

const fileTypeIcons = {
  'application/pdf': FileText,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': FileText,
  'application/msword': FileText,
  'text/plain': FileText,
  'text/html': Globe,
  'image/': Image,
  'application/zip': Archive,
  'application/x-zip-compressed': Archive,
}

export const DocumentUpload: React.FC<DocumentUploadProps> = ({
  onFilesAdded,
  onTextSubmitted,
  onUrlSubmitted,
  onEmailSetup,
  maxFiles = 10,
  maxFileSize = 50 * 1024 * 1024, // 50MB
  acceptedFileTypes = ['.pdf', '.docx', '.doc', '.txt', '.html'],
  className,
}) => {
  const [activeMethod, setActiveMethod] = React.useState<string>('file')
  const [uploadedFiles, setUploadedFiles] = React.useState<UploadFile[]>([])
  const [textInput, setTextInput] = React.useState('')
  const [urlInput, setUrlInput] = React.useState('')
  const [isDragActive, setIsDragActive] = React.useState(false)

  const { getRootProps, getInputProps, isDragActive: dropzoneActive } = useDropzone({
    onDrop: handleFileDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/msword': ['.doc'],
      'text/plain': ['.txt'],
      'text/html': ['.html'],
    },
    maxFiles,
    maxSize: maxFileSize,
    disabled: activeMethod !== 'file',
  })

  React.useEffect(() => {
    setIsDragActive(dropzoneActive)
  }, [dropzoneActive])

  function handleFileDrop(acceptedFiles: File[], rejectedFiles: any[]) {
    if (rejectedFiles.length > 0) {
      // Handle rejected files
      console.warn('Rejected files:', rejectedFiles)
    }

    if (acceptedFiles.length > 0) {
      const newFiles: UploadFile[] = acceptedFiles.map(file => ({
        id: Math.random().toString(36).substr(2, 9),
        file,
        status: 'uploading',
        progress: 0,
      }))

      setUploadedFiles(prev => [...prev, ...newFiles])
      
      // Simulate upload progress
      newFiles.forEach(uploadFile => {
        simulateUpload(uploadFile)
      })

      onFilesAdded?.(acceptedFiles)
    }
  }

  function simulateUpload(uploadFile: UploadFile) {
    const interval = setInterval(() => {
      setUploadedFiles(prev => prev.map(file => {
        if (file.id === uploadFile.id) {
          const newProgress = Math.min(file.progress + Math.random() * 20, 100)
          
          if (newProgress >= 100) {
            clearInterval(interval)
            return { ...file, status: 'processing', progress: 100 }
          }
          
          return { ...file, progress: newProgress }
        }
        return file
      }))
    }, 200)

    // Simulate processing completion
    setTimeout(() => {
      setUploadedFiles(prev => prev.map(file => 
        file.id === uploadFile.id 
          ? { ...file, status: 'completed' }
          : file
      ))
    }, 3000 + Math.random() * 2000)
  }

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      onTextSubmitted?.(textInput.trim())
      setTextInput('')
    }
  }

  const handleUrlSubmit = () => {
    if (urlInput.trim()) {
      onUrlSubmitted?.(urlInput.trim())
      setUrlInput('')
    }
  }

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(file => file.id !== fileId))
  }

  const getFileIcon = (fileType: string) => {
    const IconComponent = Object.entries(fileTypeIcons).find(([type]) => 
      fileType.startsWith(type)
    )?.[1] || FileText
    
    return IconComponent
  }

  return (
    <Card className={cn('w-full max-w-4xl mx-auto', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="w-5 h-5" />
          Upload Document for Analysis
        </CardTitle>
        <p className="text-muted-foreground">
          Choose your preferred method to upload terms of service, privacy policies, or other legal documents.
        </p>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Upload Method Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
          {uploadMethods.map((method) => (
            <button
              key={method.id}
              onClick={() => setActiveMethod(method.id)}
              className={cn(
                'flex flex-col items-center gap-2 p-4 rounded-lg border-2 transition-all duration-200 text-left',
                activeMethod === method.id
                  ? 'border-guardian-300 bg-guardian-50 dark:border-guardian-700 dark:bg-guardian-950/20'
                  : 'border-border hover:border-guardian-200 dark:hover:border-guardian-800'
              )}
            >
              <method.icon className={cn(
                'w-6 h-6',
                activeMethod === method.id ? 'text-guardian-600' : 'text-muted-foreground'
              )} />
              <div className="text-center">
                <div className={cn(
                  'font-medium text-sm',
                  activeMethod === method.id ? 'text-guardian-700 dark:text-guardian-300' : 'text-foreground'
                )}>
                  {method.label}
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {method.description}
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Upload Content */}
        <AnimatePresence mode="wait">
          {activeMethod === 'file' && (
            <motion.div
              key="file-upload"
              variants={ANIMATION_VARIANTS.fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              {/* Dropzone */}
              <div
                {...getRootProps()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200',
                  isDragActive 
                    ? 'border-guardian-400 bg-guardian-50 dark:bg-guardian-950/20' 
                    : 'border-border hover:border-guardian-300 dark:hover:border-guardian-700',
                  uploadedFiles.length > 0 && 'border-sage-300 bg-sage-50 dark:bg-sage-950/20'
                )}
              >
                <input {...getInputProps()} />
                
                <div className="space-y-4">
                  <div className={cn(
                    'w-16 h-16 mx-auto rounded-full flex items-center justify-center',
                    isDragActive 
                      ? 'bg-guardian-100 text-guardian-600' 
                      : 'bg-muted text-muted-foreground'
                  )}>
                    <Upload className="w-8 h-8" />
                  </div>
                  
                  <div>
                    <p className="text-lg font-medium text-foreground">
                      {isDragActive ? 'Drop files here' : 'Drag & drop files here'}
                    </p>
                    <p className="text-muted-foreground mt-1">
                      or click to browse your files
                    </p>
                  </div>
                  
                  <div className="flex flex-wrap justify-center gap-2">
                    {acceptedFileTypes.map((type) => (
                      <Badge key={type} variant="secondary" size="sm">
                        {type.toUpperCase()}
                      </Badge>
                    ))}
                  </div>
                  
                  <p className="text-sm text-muted-foreground">
                    Maximum file size: {formatBytes(maxFileSize)} • 
                    Up to {maxFiles} files
                  </p>
                </div>
              </div>

              {/* Uploaded Files */}
              {uploadedFiles.length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-medium text-foreground">Uploaded Files</h4>
                  {uploadedFiles.map((uploadFile) => {
                    const FileIcon = getFileIcon(uploadFile.file.type)
                    
                    return (
                      <motion.div
                        key={uploadFile.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 p-3 rounded-lg border border-border"
                      >
                        <FileIcon className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="font-medium text-sm text-foreground truncate">
                              {uploadFile.file.name}
                            </p>
                            <div className="flex items-center gap-2">
                              {uploadFile.status === 'uploading' && (
                                <Loader2 className="w-4 h-4 animate-spin text-guardian-600" />
                              )}
                              {uploadFile.status === 'processing' && (
                                <Loader2 className="w-4 h-4 animate-spin text-alert-600" />
                              )}
                              {uploadFile.status === 'completed' && (
                                <Check className="w-4 h-4 text-sage-600" />
                              )}
                              {uploadFile.status === 'error' && (
                                <AlertCircle className="w-4 h-4 text-danger-600" />
                              )}
                              <Button
                                variant="ghost"
                                size="icon-sm"
                                onClick={() => removeFile(uploadFile.id)}
                              >
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-foreground">
                              {formatBytes(uploadFile.file.size)}
                            </span>
                            <Badge 
                              variant={
                                uploadFile.status === 'completed' ? 'success' :
                                uploadFile.status === 'error' ? 'destructive' :
                                'secondary'
                              }
                              size="sm"
                            >
                              {uploadFile.status}
                            </Badge>
                          </div>
                          
                          {(uploadFile.status === 'uploading' || uploadFile.status === 'processing') && (
                            <Progress
                              value={uploadFile.progress}
                              className="mt-2"
                              color={uploadFile.status === 'processing' ? 'warning' : 'guardian'}
                              size="sm"
                            />
                          )}
                          
                          {uploadFile.error && (
                            <p className="text-xs text-danger-600 mt-1">
                              {uploadFile.error}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )
                  })}
                </div>
              )}
            </motion.div>
          )}

          {activeMethod === 'url' && (
            <motion.div
              key="url-input"
              variants={ANIMATION_VARIANTS.fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Document URL
                </label>
                <Input
                  placeholder="https://example.com/terms-of-service"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  leftIcon={<Link className="w-4 h-4" />}
                />
                <p className="text-sm text-muted-foreground">
                  Enter the URL of the terms of service, privacy policy, or legal document you want to analyze.
                </p>
              </div>
              
              <Button
                onClick={handleUrlSubmit}
                disabled={!urlInput.trim()}
                className="w-full"
              >
                Analyze URL
              </Button>
            </motion.div>
          )}

          {activeMethod === 'text' && (
            <motion.div
              key="text-input"
              variants={ANIMATION_VARIANTS.fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  Document Text
                </label>
                <textarea
                  className="w-full h-64 p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-guardian-500 focus:border-guardian-500"
                  placeholder="Paste your terms of service, privacy policy, or other legal document text here..."
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                />
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    Minimum 100 characters recommended for accurate analysis
                  </span>
                  <span>
                    {textInput.length} characters
                  </span>
                </div>
              </div>
              
              <Button
                onClick={handleTextSubmit}
                disabled={textInput.trim().length < 100}
                className="w-full"
              >
                Analyze Text
              </Button>
            </motion.div>
          )}

          {activeMethod === 'email' && (
            <motion.div
              key="email-setup"
              variants={ANIMATION_VARIANTS.fadeIn}
              initial="initial"
              animate="animate"
              exit="exit"
              className="space-y-4"
            >
              <div className="text-center space-y-4">
                <div className="w-16 h-16 mx-auto rounded-full bg-guardian-100 dark:bg-guardian-950 flex items-center justify-center">
                  <Mail className="w-8 h-8 text-guardian-600 dark:text-guardian-400" />
                </div>
                
                <div>
                  <h3 className="font-semibold text-lg text-foreground">
                    Email Analysis Setup
                  </h3>
                  <p className="text-muted-foreground mt-2">
                    Get your unique email address to forward legal documents directly for analysis.
                  </p>
                </div>
                
                <div className="bg-muted/50 rounded-lg p-4 text-left">
                  <h4 className="font-medium text-foreground mb-2">How it works:</h4>
                  <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                    <li>We'll generate a unique email address for you</li>
                    <li>Forward any legal document to this address</li>
                    <li>Get automated analysis results in your inbox</li>
                    <li>Access detailed reports in your dashboard</li>
                  </ol>
                </div>
                
                <Button
                  onClick={onEmailSetup}
                  variant="default"
                  className="w-full"
                >
                  Set Up Email Analysis
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  )
}
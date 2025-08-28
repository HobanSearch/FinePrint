import type { PlasmoCSConfig } from "plasmo"
import { useMessage } from "@plasmohq/messaging/hook"
import { useStorage } from "@plasmohq/storage/hook"
import { sendToBackground } from "@plasmohq/messaging"
import { useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

import { PageDetector } from "@/lib/page-detector"
import { ExtensionStorage } from "@/lib/storage"
import type { 
  PageAnalysisState, 
  ExtensionFinding, 
  ExtensionSettings,
  AnalysisProgress,
  TooltipData 
} from "@/types"

import "../style.css"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  run_at: "document_end",
  all_frames: false
}

// Analysis overlay component
const AnalysisOverlay = () => {
  const [settings] = useStorage<ExtensionSettings>("settings")
  const [analysisState, setAnalysisState] = useState<PageAnalysisState | null>(null)
  const [progress, setProgress] = useState<AnalysisProgress | null>(null)
  const [tooltip, setTooltip] = useState<TooltipData | null>(null)
  const [isVisible, setIsVisible] = useState(false)

  // Listen for messages from background script
  useMessage(async (req, res) => {
    switch (req.type) {
      case "ANALYSIS_STARTED":
        setProgress({ stage: 'detecting', progress: 0, message: 'Detecting document type...' })
        setIsVisible(true)
        break
      
      case "ANALYSIS_PROGRESS":
        setProgress(req.payload)
        break
      
      case "ANALYSIS_COMPLETE":
        setAnalysisState(req.payload)
        setProgress(null)
        if (settings?.highlightFindings) {
          highlightFindings(req.payload.findings)
        }
        break
      
      case "ANALYSIS_ERROR":
        setProgress(null)
        console.error("Analysis failed:", req.payload)
        break
      
      case "TOGGLE_HIGHLIGHTS":
        toggleHighlights()
        break
      
      case "GET_PAGE_CONTENT":
        res.send({
          url: window.location.href,
          title: document.title,
          content: extractPageContent()
        })
        break
    }
  })

  useEffect(() => {
    initializeContentScript()
  }, [])

  const initializeContentScript = async () => {
    // Check if extension is enabled
    const currentSettings = await ExtensionStorage.getSettings()
    if (!currentSettings.enabled) return

    // Detect if this is a terms/privacy page
    const content = extractPageContent()
    const detection = PageDetector.detect(window.location.href, document.title, content)

    if ((detection.isTermsPage || detection.isPrivacyPage) && currentSettings.autoAnalyze) {
      // Start analysis automatically
      await sendToBackground({
        name: "startAnalysis",
        body: {
          url: window.location.href,
          title: document.title,
          content,
          detection
        }
      })
    }

    // Set up page mutation observer for SPAs
    setupPageObserver()
  }

  const setupPageObserver = () => {
    const observer = new MutationObserver((mutations) => {
      let significantChange = false
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if added nodes contain substantial content
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element
              if (element.textContent && element.textContent.length > 100) {
                significantChange = true
                break
              }
            }
          }
        }
      })

      if (significantChange) {
        debounceAnalysis()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true
    })
  }

  let analysisTimeout: NodeJS.Timeout
  const debounceAnalysis = () => {
    clearTimeout(analysisTimeout)
    analysisTimeout = setTimeout(async () => {
      const content = extractPageContent()
      const detection = PageDetector.detectSPA(window.location.href, document.title, content)
      
      if ((detection.isTermsPage || detection.isPrivacyPage) && settings?.autoAnalyze) {
        await sendToBackground({
          name: "startAnalysis",
          body: {
            url: window.location.href,
            title: document.title,
            content,
            detection
          }
        })
      }
    }, 2000)
  }

  const extractPageContent = (): string => {
    // Remove script and style elements
    const clone = document.cloneNode(true) as Document
    const scripts = clone.querySelectorAll('script, style, noscript, iframe')
    scripts.forEach(el => el.remove())

    // Get main content areas
    const contentSelectors = [
      'main',
      '[role="main"]',
      '.main-content',
      '.content',
      '.legal-content',
      '.terms-content',
      '.privacy-content',
      'article',
      '.document-content'
    ]

    let content = ''
    
    for (const selector of contentSelectors) {
      const element = clone.querySelector(selector)
      if (element) {
        content = element.textContent || ''
        break
      }
    }

    // Fallback to body content
    if (!content || content.length < 500) {
      content = clone.body?.textContent || clone.documentElement?.textContent || ''
    }

    // Clean up whitespace
    return content.replace(/\s+/g, ' ').trim()
  }

  const highlightFindings = (findings: ExtensionFinding[]) => {
    // Remove existing highlights
    removeExistingHighlights()

    findings.forEach((finding, index) => {
      if (finding.positionStart && finding.positionEnd) {
        highlightTextRange(finding, index)
      }
    })
  }

  const highlightTextRange = (finding: ExtensionFinding, index: number) => {
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    )

    let currentPos = 0
    let textNode: Text | null = null

    // Find the text node containing the finding
    while (textNode = walker.nextNode() as Text) {
      const nodeLength = textNode.textContent?.length || 0
      
      if (currentPos + nodeLength >= finding.positionStart) {
        // This node contains the start of our finding
        const relativeStart = finding.positionStart - currentPos
        const relativeEnd = Math.min(finding.positionEnd - currentPos, nodeLength)
        
        if (relativeStart >= 0 && relativeEnd > relativeStart) {
          createHighlight(textNode, relativeStart, relativeEnd, finding, index)
        }
        break
      }
      
      currentPos += nodeLength
    }
  }

  const createHighlight = (
    textNode: Text, 
    start: number, 
    end: number, 
    finding: ExtensionFinding, 
    index: number
  ) => {
    const parent = textNode.parentNode
    if (!parent) return

    // Split the text node
    const beforeText = textNode.textContent?.substring(0, start) || ''
    const highlightText = textNode.textContent?.substring(start, end) || ''
    const afterText = textNode.textContent?.substring(end) || ''

    // Create highlight element
    const highlight = document.createElement('span')
    highlight.className = `fineprint-highlight risk-${finding.severity}`
    highlight.setAttribute('data-finding-id', finding.id)
    highlight.setAttribute('data-finding-index', index.toString())
    highlight.textContent = highlightText
    highlight.title = finding.title

    // Add click handler
    highlight.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      showTooltip(finding, e.clientX, e.clientY)
    })

    // Replace original text node
    parent.removeChild(textNode)
    
    if (beforeText) {
      parent.appendChild(document.createTextNode(beforeText))
    }
    
    parent.appendChild(highlight)
    
    if (afterText) {
      parent.appendChild(document.createTextNode(afterText))
    }
  }

  const showTooltip = (finding: ExtensionFinding, x: number, y: number) => {
    setTooltip({
      findingId: finding.id,
      title: finding.title,
      description: finding.description,
      severity: finding.severity,
      recommendation: finding.recommendation,
      position: { x, y }
    })
  }

  const hideTooltip = () => {
    setTooltip(null)
  }

  const removeExistingHighlights = () => {
    const highlights = document.querySelectorAll('.fineprint-highlight')
    highlights.forEach(highlight => {
      const parent = highlight.parentNode
      if (parent) {
        parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight)
      }
    })
  }

  const toggleHighlights = () => {
    const highlights = document.querySelectorAll('.fineprint-highlight')
    highlights.forEach(highlight => {
      const element = highlight as HTMLElement
      element.style.display = element.style.display === 'none' ? '' : 'none'
    })
  }

  if (!isVisible && !analysisState && !progress) {
    return null
  }

  return (
    <>
      {/* Progress indicator */}
      {progress && (
        <div className="fineprint-widget">
          <div className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  Analyzing Document
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {progress.message}
                </div>
                <div className="fineprint-progress mt-2">
                  <div 
                    className="fineprint-progress-bar"
                    style={{ width: `${progress.progress}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Analysis results widget */}
      {analysisState && !progress && (
        <div className="fineprint-widget">
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">FP</span>
                </div>
                <span className="font-medium text-sm">Fine Print AI</span>
              </div>
              <button
                onClick={() => setIsVisible(false)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                ×
              </button>
            </div>
            
            {analysisState.riskScore !== null && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-gray-600">Risk Score</span>
                  <span className={`fineprint-risk-badge ${getRiskLevel(analysisState.riskScore)}`}>
                    {analysisState.riskScore}/100
                  </span>
                </div>
              </div>
            )}

            {analysisState.findings.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-900">
                  {analysisState.findings.length} Issues Found
                </div>
                <div className="space-y-1">
                  {analysisState.findings.slice(0, 3).map((finding, index) => (
                    <div key={finding.id} className="text-xs text-gray-600 flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full bg-${getRiskColor(finding.severity)}-500`} />
                      <span className="truncate">{finding.title}</span>
                    </div>
                  ))}
                  {analysisState.findings.length > 3 && (
                    <div className="text-xs text-gray-500">
                      +{analysisState.findings.length - 3} more issues
                    </div>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={() => chrome.action?.openPopup?.()}
              className="w-full mt-3 bg-blue-600 text-white text-sm font-medium py-2 px-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              View Full Report
            </button>
          </div>
        </div>
      )}

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fineprint-tooltip visible"
          style={{
            left: tooltip.position.x,
            top: tooltip.position.y - 10,
            transform: 'translateX(-50%) translateY(-100%)'
          }}
        >
          <div className="font-medium text-sm mb-1">{tooltip.title}</div>
          <div className="text-xs text-gray-600 mb-2">{tooltip.description}</div>
          {tooltip.recommendation && (
            <div className="text-xs text-blue-600 font-medium">
              💡 {tooltip.recommendation}
            </div>
          )}
          <button
            onClick={hideTooltip}
            className="absolute top-1 right-1 text-gray-400 hover:text-gray-600 text-xs"
          >
            ×
          </button>
        </div>
      )}

      {/* Click outside to hide tooltip */}
      {tooltip && (
        <div
          className="fixed inset-0 z-[999997]"
          onClick={hideTooltip}
        />
      )}
    </>
  )
}

const getRiskLevel = (score: number): string => {
  if (score >= 80) return 'critical'
  if (score >= 60) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

const getRiskColor = (severity: string): string => {
  switch (severity) {
    case 'critical': return 'red'
    case 'high': return 'red'
    case 'medium': return 'yellow'
    case 'low': return 'green'
    default: return 'gray'
  }
}

// Create and mount the overlay
const mountOverlay = () => {
  const existingOverlay = document.getElementById('fineprint-overlay')
  if (existingOverlay) {
    existingOverlay.remove()
  }

  const overlay = document.createElement('div')
  overlay.id = 'fineprint-overlay'
  overlay.className = 'fineprint-extension'
  document.body.appendChild(overlay)

  const root = createRoot(overlay)
  root.render(<AnalysisOverlay />)
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountOverlay)
} else {
  mountOverlay()
}
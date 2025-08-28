/**
 * Fine Print AI - iOS Live Activities Widget
 * 
 * SwiftUI implementation for Live Activities showing document analysis progress
 * in Dynamic Island and Lock Screen
 */

import ActivityKit
import WidgetKit
import SwiftUI

// MARK: - Activity Attributes
struct DocumentAnalysisAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        let progress: Double
        let currentStep: String
        let timeRemaining: Int?
        let riskIndicators: RiskIndicators?
        let isComplete: Bool
        let finalRiskScore: Double?
    }
    
    let documentName: String
    let analysisId: String
}

struct RiskIndicators: Codable, Hashable {
    let privacy: Double
    let legal: Double
    let financial: Double
}

// MARK: - Live Activity Widget
struct DocumentAnalysisLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DocumentAnalysisAttributes.self) { context in
            // Lock Screen/Banner UI
            LockScreenLiveActivityView(context: context)
        } dynamicIsland: { context in
            // Dynamic Island UI
            DynamicIsland {
                // Expanded UI
                DynamicIslandExpandedRegion(.leading) {
                    ExpandedLeadingView(context: context)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    ExpandedTrailingView(context: context)
                }
                DynamicIslandExpandedRegion(.center) {
                    ExpandedCenterView(context: context)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottomView(context: context)
                }
            } compactLeading: {
                // Compact leading
                CompactLeadingView(context: context)
            } compactTrailing: {
                // Compact trailing
                CompactTrailingView(context: context)
            } minimal: {
                // Minimal view
                MinimalView(context: context)
            }
            .keylineTint(Color.blue)
        }
    }
}

// MARK: - Lock Screen View
struct LockScreenLiveActivityView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        VStack(spacing: 12) {
            // Header
            HStack {
                Image(systemName: "shield.checkered")
                    .foregroundColor(.blue)
                    .font(.title3)
                
                VStack(alignment: .leading, spacing: 2) {
                    Text("Fine Print AI")
                        .font(.headline)
                        .foregroundColor(.primary)
                    
                    Text(context.attributes.documentName)
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .lineLimit(1)
                }
                
                Spacer()
                
                if context.state.isComplete, let finalScore = context.state.finalRiskScore {
                    RiskScoreBadge(score: finalScore)
                } else {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.headline)
                        .foregroundColor(.blue)
                }
            }
            
            // Progress and Status
            if !context.state.isComplete {
                VStack(spacing: 8) {
                    // Progress Bar
                    ProgressView(value: context.state.progress)
                        .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                    
                    // Current Step
                    HStack {
                        Text(context.state.currentStep)
                            .font(.caption)
                            .foregroundColor(.secondary)
                        
                        Spacer()
                        
                        if let timeRemaining = context.state.timeRemaining {
                            Text("\(timeRemaining)s remaining")
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            } else {
                // Completion Message
                HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundColor(.green)
                        .font(.subheadline)
                    
                    Text("Analysis complete")
                        .font(.subheadline)
                        .foregroundColor(.primary)
                    
                    Spacer()
                }
            }
            
            // Risk Indicators (if available)
            if let riskIndicators = context.state.riskIndicators {
                RiskIndicatorsView(indicators: riskIndicators)
            }
        }
        .padding()
        .background(Color(.systemGroupedBackground))
        .cornerRadius(12)
    }
}

// MARK: - Dynamic Island Views

struct ExpandedLeadingView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Image(systemName: "shield.checkered")
                .foregroundColor(.blue)
                .font(.title3)
            
            if context.state.isComplete {
                Text("Complete")
                    .font(.caption2)
                    .foregroundColor(.green)
            } else {
                Text("\(Int(context.state.progress * 100))%")
                    .font(.caption)
                    .foregroundColor(.blue)
                    .monospacedDigit()
            }
        }
    }
}

struct ExpandedTrailingView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        VStack(alignment: .trailing, spacing: 4) {
            if context.state.isComplete, let finalScore = context.state.finalRiskScore {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Risk Score")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text("\(Int(finalScore * 100))%")
                        .font(.caption)
                        .foregroundColor(riskColor(for: finalScore))
                        .fontWeight(.semibold)
                }
            } else if let timeRemaining = context.state.timeRemaining {
                VStack(alignment: .trailing, spacing: 2) {
                    Text("Remaining")
                        .font(.caption2)
                        .foregroundColor(.secondary)
                    
                    Text("\(timeRemaining)s")
                        .font(.caption)
                        .foregroundColor(.blue)
                        .monospacedDigit()
                }
            }
        }
    }
    
    private func riskColor(for score: Double) -> Color {
        switch score {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .orange
        default: return .red
        }
    }
}

struct ExpandedCenterView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        VStack(spacing: 4) {
            Text(context.attributes.documentName)
                .font(.caption)
                .foregroundColor(.primary)
                .lineLimit(1)
            
            if !context.state.isComplete {
                ProgressView(value: context.state.progress)
                    .progressViewStyle(LinearProgressViewStyle(tint: .blue))
                    .frame(height: 2)
            }
        }
    }
}

struct ExpandedBottomView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        HStack {
            Text(context.state.currentStep)
                .font(.caption2)
                .foregroundColor(.secondary)
                .lineLimit(1)
            
            Spacer()
            
            if let riskIndicators = context.state.riskIndicators {
                HStack(spacing: 8) {
                    RiskDot(level: riskIndicators.privacy, label: "P")
                    RiskDot(level: riskIndicators.legal, label: "L")
                    RiskDot(level: riskIndicators.financial, label: "F")
                }
            }
        }
    }
}

struct CompactLeadingView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        Image(systemName: context.state.isComplete ? "checkmark.circle.fill" : "shield.checkered")
            .foregroundColor(context.state.isComplete ? .green : .blue)
            .font(.system(size: 16))
    }
}

struct CompactTrailingView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        if context.state.isComplete, let finalScore = context.state.finalRiskScore {
            Text("\(Int(finalScore * 100))%")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(riskColor(for: finalScore))
                .monospacedDigit()
        } else {
            Text("\(Int(context.state.progress * 100))%")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(.blue)
                .monospacedDigit()
        }
    }
    
    private func riskColor(for score: Double) -> Color {
        switch score {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .orange
        default: return .red
        }
    }
}

struct MinimalView: View {
    let context: ActivityViewContext<DocumentAnalysisAttributes>
    
    var body: some View {
        if context.state.isComplete {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .font(.system(size: 16))
        } else {
            ZStack {
                Circle()
                    .stroke(Color.blue.opacity(0.3), lineWidth: 2)
                
                Circle()
                    .trim(from: 0, to: context.state.progress)
                    .stroke(Color.blue, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .animation(.easeInOut, value: context.state.progress)
            }
            .frame(width: 16, height: 16)
        }
    }
}

// MARK: - Supporting Views

struct RiskScoreBadge: View {
    let score: Double
    
    var body: some View {
        HStack(spacing: 4) {
            Circle()
                .fill(riskColor)
                .frame(width: 8, height: 8)
            
            Text("\(Int(score * 100))%")
                .font(.caption)
                .fontWeight(.semibold)
                .foregroundColor(riskColor)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(riskColor.opacity(0.1))
        .cornerRadius(8)
    }
    
    private var riskColor: Color {
        switch score {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .orange
        default: return .red
        }
    }
}

struct RiskIndicatorsView: View {
    let indicators: RiskIndicators
    
    var body: some View {
        HStack(spacing: 12) {
            RiskIndicator(label: "Privacy", level: indicators.privacy)
            RiskIndicator(label: "Legal", level: indicators.legal)
            RiskIndicator(label: "Financial", level: indicators.financial)
        }
        .padding(.top, 4)
    }
}

struct RiskIndicator: View {
    let label: String
    let level: Double
    
    var body: some View {
        VStack(spacing: 4) {
            Text(label)
                .font(.caption2)
                .foregroundColor(.secondary)
            
            ZStack {
                Circle()
                    .stroke(Color.gray.opacity(0.3), lineWidth: 2)
                    .frame(width: 20, height: 20)
                
                Circle()
                    .trim(from: 0, to: level)
                    .stroke(riskColor, style: StrokeStyle(lineWidth: 2, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 20, height: 20)
                
                Text("\(Int(level * 100))")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundColor(riskColor)
            }
        }
    }
    
    private var riskColor: Color {
        switch level {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .orange
        default: return .red
        }
    }
}

struct RiskDot: View {
    let level: Double
    let label: String
    
    var body: some View {
        VStack(spacing: 2) {
            Circle()
                .fill(riskColor)
                .frame(width: 8, height: 8)
            
            Text(label)
                .font(.system(size: 6))
                .foregroundColor(.secondary)
        }
    }
    
    private var riskColor: Color {
        switch level {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .orange
        default: return .red
        }
    }
}

// MARK: - Widget Bundle
@main
struct LiveActivitiesWidgetBundle: WidgetBundle {
    var body: some Widget {
        DocumentAnalysisLiveActivity()
    }
}

#if DEBUG
struct DocumentAnalysisLiveActivity_Previews: PreviewProvider {
    static let attributes = DocumentAnalysisAttributes(
        documentName: "Privacy Policy",
        analysisId: "analysis_123"
    )
    
    static let contentState = DocumentAnalysisAttributes.ContentState(
        progress: 0.65,
        currentStep: "Analyzing privacy clauses...",
        timeRemaining: 12,
        riskIndicators: RiskIndicators(privacy: 0.8, legal: 0.6, financial: 0.3),
        isComplete: false,
        finalRiskScore: nil
    )
    
    static var previews: some View {
        attributes
            .previewContext(contentState, viewKind: .dynamicIsland(.compact))
            .previewDisplayName("Island Compact")
        
        attributes
            .previewContext(contentState, viewKind: .dynamicIsland(.expanded))
            .previewDisplayName("Island Expanded")
        
        attributes
            .previewContext(contentState, viewKind: .content)
            .previewDisplayName("Notification")
    }
}
#endif
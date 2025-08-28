import WidgetKit
import SwiftUI
import Intents

// MARK: - Widget Timeline Provider
struct FPWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> FPWidgetEntry {
        FPWidgetEntry(
            date: Date(),
            riskScore: 0.75,
            recentDocuments: sampleDocuments(),
            hasNewAlerts: false
        )
    }
    
    func getSnapshot(in context: Context, completion: @escaping (FPWidgetEntry) -> ()) {
        let entry = FPWidgetEntry(
            date: Date(),
            riskScore: 0.68,
            recentDocuments: sampleDocuments(),
            hasNewAlerts: true
        )
        completion(entry)
    }
    
    func getTimeline(in context: Context, completion: @escaping (Timeline<FPWidgetEntry>) -> ()) {
        Task {
            let entries = await fetchWidgetData()
            let timeline = Timeline(entries: entries, policy: .after(Date().addingTimeInterval(15 * 60))) // Refresh every 15 minutes
            completion(timeline)
        }
    }
    
    private func fetchWidgetData() async -> [FPWidgetEntry] {
        // Fetch data from shared UserDefaults or app group container
        let sharedDefaults = UserDefaults(suiteName: "group.com.fineprintai.mobile")
        
        let riskScore = sharedDefaults?.double(forKey: "latest_risk_score") ?? 0.0
        let hasNewAlerts = sharedDefaults?.bool(forKey: "has_new_alerts") ?? false
        
        // Decode recent documents from shared storage
        var recentDocuments: [DocumentSummary] = []
        if let documentsData = sharedDefaults?.data(forKey: "recent_documents"),
           let documents = try? JSONDecoder().decode([DocumentSummary].self, from: documentsData) {
            recentDocuments = documents
        }
        
        let entry = FPWidgetEntry(
            date: Date(),
            riskScore: riskScore,
            recentDocuments: recentDocuments,
            hasNewAlerts: hasNewAlerts
        )
        
        return [entry]
    }
    
    private func sampleDocuments() -> [DocumentSummary] {
        return [
            DocumentSummary(id: "1", name: "Privacy Policy", riskScore: 0.82, lastUpdated: Date()),
            DocumentSummary(id: "2", name: "Terms of Service", riskScore: 0.65, lastUpdated: Date()),
            DocumentSummary(id: "3", name: "EULA Agreement", riskScore: 0.91, lastUpdated: Date())
        ]
    }
}

// MARK: - Widget Entry
struct FPWidgetEntry: TimelineEntry {
    let date: Date
    let riskScore: Double
    let recentDocuments: [DocumentSummary]
    let hasNewAlerts: Bool
}

// MARK: - Document Summary Model
struct DocumentSummary: Codable, Identifiable {
    let id: String
    let name: String
    let riskScore: Double
    let lastUpdated: Date
}

// MARK: - Widget Views
struct FPWidgetSmallView: View {
    let entry: FPWidgetEntry
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color.blue.opacity(0.8), Color.purple.opacity(0.6)]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            VStack(spacing: 8) {
                HStack {
                    Image(systemName: "shield.checkered")
                        .foregroundColor(.white)
                        .font(.title2)
                    Spacer()
                    if entry.hasNewAlerts {
                        Circle()
                            .fill(Color.red)
                            .frame(width: 8, height: 8)
                    }
                }
                
                Spacer()
                
                VStack(spacing: 4) {
                    Text("Risk Score")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.8))
                    
                    Text("\(Int(entry.riskScore * 100))%")
                        .font(.title2)
                        .fontWeight(.bold)
                        .foregroundColor(.white)
                    
                    RiskIndicatorBar(score: entry.riskScore)
                }
                
                Spacer()
            }
            .padding()
        }
        .widgetURL(URL(string: "fineprintai://dashboard"))
    }
}

struct FPWidgetMediumView: View {
    let entry: FPWidgetEntry
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color.blue.opacity(0.8), Color.purple.opacity(0.6)]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            HStack(spacing: 16) {
                // Risk Score Section
                VStack(spacing: 8) {
                    HStack {
                        Image(systemName: "shield.checkered")
                            .foregroundColor(.white)
                            .font(.title3)
                        Spacer()
                        if entry.hasNewAlerts {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                        }
                    }
                    
                    Spacer()
                    
                    VStack(spacing: 4) {
                        Text("Overall Risk")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.8))
                        
                        Text("\(Int(entry.riskScore * 100))%")
                            .font(.title)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                        
                        RiskIndicatorBar(score: entry.riskScore)
                    }
                    
                    Spacer()
                }
                .frame(maxWidth: 100)
                
                Divider()
                    .background(Color.white.opacity(0.3))
                
                // Recent Documents Section
                VStack(alignment: .leading, spacing: 6) {
                    Text("Recent Analysis")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.8))
                    
                    ForEach(Array(entry.recentDocuments.prefix(3)), id: \.id) { document in
                        HStack {
                            Circle()
                                .fill(riskColor(for: document.riskScore))
                                .frame(width: 6, height: 6)
                            
                            Text(document.name)
                                .font(.caption2)
                                .foregroundColor(.white)
                                .lineLimit(1)
                            
                            Spacer()
                            
                            Text("\(Int(document.riskScore * 100))%")
                                .font(.caption2)
                                .foregroundColor(.white.opacity(0.8))
                        }
                    }
                    
                    Spacer()
                }
            }
            .padding()
        }
        .widgetURL(URL(string: "fineprintai://dashboard"))
    }
    
    private func riskColor(for score: Double) -> Color {
        switch score {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .yellow
        default: return .red
        }
    }
}

struct FPWidgetLargeView: View {
    let entry: FPWidgetEntry
    
    var body: some View {
        ZStack {
            LinearGradient(
                gradient: Gradient(colors: [Color.blue.opacity(0.8), Color.purple.opacity(0.6)]),
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            
            VStack(spacing: 16) {
                // Header
                HStack {
                    VStack(alignment: .leading) {
                        Text("Fine Print AI")
                            .font(.headline)
                            .foregroundColor(.white)
                        Text("Document Risk Monitor")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.8))
                    }
                    
                    Spacer()
                    
                    if entry.hasNewAlerts {
                        HStack {
                            Circle()
                                .fill(Color.red)
                                .frame(width: 8, height: 8)
                            Text("New Alerts")
                                .font(.caption2)
                                .foregroundColor(.white)
                        }
                    }
                }
                
                // Risk Score Dashboard
                HStack(spacing: 20) {
                    VStack {
                        Text("Overall Risk")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.8))
                        
                        Text("\(Int(entry.riskScore * 100))%")
                            .font(.largeTitle)
                            .fontWeight(.bold)
                            .foregroundColor(.white)
                        
                        RiskIndicatorBar(score: entry.riskScore)
                    }
                    
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Risk Breakdown")
                            .font(.caption)
                            .foregroundColor(.white.opacity(0.8))
                        
                        RiskBreakdownRow(label: "Privacy", score: 0.82, color: .red)
                        RiskBreakdownRow(label: "Data Usage", score: 0.65, color: .yellow)
                        RiskBreakdownRow(label: "Legal Terms", score: 0.58, color: .yellow)
                        RiskBreakdownRow(label: "Cancellation", score: 0.34, color: .green)
                    }
                }
                
                // Recent Documents
                VStack(alignment: .leading, spacing: 8) {
                    Text("Recent Documents")
                        .font(.subheadline)
                        .foregroundColor(.white)
                    
                    ForEach(Array(entry.recentDocuments.prefix(4)), id: \.id) { document in
                        HStack {
                            Circle()
                                .fill(riskColor(for: document.riskScore))
                                .frame(width: 8, height: 8)
                            
                            VStack(alignment: .leading) {
                                Text(document.name)
                                    .font(.caption)
                                    .foregroundColor(.white)
                                    .lineLimit(1)
                                
                                Text(document.lastUpdated, style: .relative)
                                    .font(.caption2)
                                    .foregroundColor(.white.opacity(0.6))
                            }
                            
                            Spacer()
                            
                            Text("\(Int(document.riskScore * 100))%")
                                .font(.caption)
                                .fontWeight(.semibold)
                                .foregroundColor(.white)
                        }
                    }
                }
                
                Spacer()
            }
            .padding()
        }
        .widgetURL(URL(string: "fineprintai://dashboard"))
    }
    
    private func riskColor(for score: Double) -> Color {
        switch score {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .yellow
        default: return .red
        }
    }
}

// MARK: - Supporting Views
struct RiskIndicatorBar: View {
    let score: Double
    
    var body: some View {
        GeometryReader { geometry in
            ZStack(alignment: .leading) {
                Rectangle()
                    .fill(Color.white.opacity(0.3))
                    .frame(height: 4)
                    .cornerRadius(2)
                
                Rectangle()
                    .fill(barColor)
                    .frame(width: geometry.size.width * CGFloat(score), height: 4)
                    .cornerRadius(2)
            }
        }
        .frame(height: 4)
    }
    
    private var barColor: Color {
        switch score {
        case 0.0..<0.3: return .green
        case 0.3..<0.7: return .yellow
        default: return .red
        }
    }
}

struct RiskBreakdownRow: View {
    let label: String
    let score: Double
    let color: Color
    
    var body: some View {
        HStack {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            
            Text(label)
                .font(.caption2)
                .foregroundColor(.white)
            
            Spacer()
            
            Text("\(Int(score * 100))%")
                .font(.caption2)
                .foregroundColor(.white.opacity(0.8))
        }
    }
}

// MARK: - Widget Configuration
struct FPWidget: Widget {
    let kind: String = "FPWidget"
    
    var body: some WidgetConfiguration {
        StaticConfiguration(
            kind: kind,
            provider: FPWidgetProvider()
        ) { entry in
            FPWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Fine Print AI")
        .description("Monitor your document risk scores and recent analyses.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

struct FPWidgetEntryView: View {
    var entry: FPWidgetProvider.Entry
    @Environment(\.widgetFamily) var family
    
    var body: some View {
        switch family {
        case .systemSmall:
            FPWidgetSmallView(entry: entry)
        case .systemMedium:
            FPWidgetMediumView(entry: entry)
        case .systemLarge:
            FPWidgetLargeView(entry: entry)
        @unknown default:
            FPWidgetSmallView(entry: entry)
        }
    }
}

// MARK: - Widget Bundle
@main
struct FPWidgetBundle: WidgetBundle {
    var body: some Widget {
        FPWidget()
    }
}

#if DEBUG
struct FPWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            FPWidgetEntryView(entry: FPWidgetEntry(
                date: Date(),
                riskScore: 0.75,
                recentDocuments: [
                    DocumentSummary(id: "1", name: "Privacy Policy", riskScore: 0.82, lastUpdated: Date()),
                    DocumentSummary(id: "2", name: "Terms of Service", riskScore: 0.65, lastUpdated: Date()),
                    DocumentSummary(id: "3", name: "EULA Agreement", riskScore: 0.91, lastUpdated: Date())
                ],
                hasNewAlerts: true
            ))
            .previewContext(WidgetPreviewContext(family: .systemSmall))
            
            FPWidgetEntryView(entry: FPWidgetEntry(
                date: Date(),
                riskScore: 0.75,
                recentDocuments: [
                    DocumentSummary(id: "1", name: "Privacy Policy", riskScore: 0.82, lastUpdated: Date()),
                    DocumentSummary(id: "2", name: "Terms of Service", riskScore: 0.65, lastUpdated: Date()),
                    DocumentSummary(id: "3", name: "EULA Agreement", riskScore: 0.91, lastUpdated: Date())
                ],
                hasNewAlerts: false
            ))
            .previewContext(WidgetPreviewContext(family: .systemMedium))
            
            FPWidgetEntryView(entry: FPWidgetEntry(
                date: Date(),
                riskScore: 0.75,
                recentDocuments: [
                    DocumentSummary(id: "1", name: "Privacy Policy", riskScore: 0.82, lastUpdated: Date()),
                    DocumentSummary(id: "2", name: "Terms of Service", riskScore: 0.65, lastUpdated: Date()),
                    DocumentSummary(id: "3", name: "EULA Agreement", riskScore: 0.91, lastUpdated: Date()),
                    DocumentSummary(id: "4", name: "Cookie Policy", riskScore: 0.45, lastUpdated: Date())
                ],
                hasNewAlerts: true
            ))
            .previewContext(WidgetPreviewContext(family: .systemLarge))
        }
    }
}
#endif
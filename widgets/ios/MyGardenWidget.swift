import Foundation
import WidgetKit
import SwiftUI

private let widgetAppName = "My Garden"
private let widgetAppScheme = "my-garden"
private let widgetAppURL = URL(string: "\(widgetAppScheme)://")!
private let widgetAppGroupId = "group.com.mygarden.app"

struct PlantWidgetEntry: TimelineEntry {
    let date: Date
    let plantCount: Int
    let nextWatering: String
    let nextWateringPlant: String
    let hasOverdue: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> PlantWidgetEntry {
        PlantWidgetEntry(
            date: Date(),
            plantCount: 5,
            nextWatering: "14:00",
            nextWateringPlant: "Basil",
            hasOverdue: false
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (PlantWidgetEntry) -> Void) {
        let entry = loadWidgetData()
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PlantWidgetEntry>) -> Void) {
        let entry = loadWidgetData()
        let timeline = Timeline(entries: [entry], policy: .atEnd)
        completion(timeline)
    }
    
    private func loadWidgetData() -> PlantWidgetEntry {
        let defaults = UserDefaults(suiteName: widgetAppGroupId)
        return PlantWidgetEntry(
            date: Date(),
            plantCount: defaults?.integer(forKey: "plantCount") ?? 0,
            nextWatering: defaults?.string(forKey: "nextWatering") ?? "--:--",
            nextWateringPlant: defaults?.string(forKey: "nextWateringPlant") ?? "Không có",
            hasOverdue: defaults?.bool(forKey: "hasOverdue") ?? false
        )
    }
}

struct MyGardenWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) var family

    var body: some View {
        Group {
            switch family {
            case .systemSmall:
                SmallWidgetView(entry: entry)
            case .systemMedium:
                MediumWidgetView(entry: entry)
            case .systemLarge:
                LargeWidgetView(entry: entry)
            default:
                SmallWidgetView(entry: entry)
            }
        }
        .widgetURL(widgetAppURL)
    }
}

struct SmallWidgetView: View {
    let entry: PlantWidgetEntry
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundColor(.green)
                Text(widgetAppName)
                    .font(.caption)
                    .bold()
                Spacer()
            }
            
            VStack(alignment: .leading, spacing: 4) {
                Text("\(entry.plantCount)")
                    .font(.largeTitle)
                    .bold()
                Text("cây")
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Spacer()
            
            HStack {
                Image(systemName: "drop.fill")
                    .foregroundColor(.blue)
                    .font(.caption)
                Text(entry.nextWatering)
                    .font(.caption)
                    .bold()
            }
            .foregroundColor(entry.hasOverdue ? .red : .primary)
        }
        .padding()
        .widgetBackground(Color(UIColor.systemBackground))
    }
}

struct MediumWidgetView: View {
    let entry: PlantWidgetEntry
    
    var body: some View {
        HStack(spacing: 16) {
            // Left: Stats
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Image(systemName: "leaf.fill")
                        .foregroundColor(.green)
                    Text(widgetAppName)
                        .font(.headline)
                        .bold()
                }
                
                HStack(spacing: 20) {
                    VStack(alignment: .leading) {
                        Text("\(entry.plantCount)")
                            .font(.title)
                            .bold()
                        Text("cây trồng")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    
                    if entry.hasOverdue {
                        VStack(alignment: .leading) {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                                .font(.title2)
                            Text("Cần tưới")
                                .font(.caption)
                                .foregroundColor(.orange)
                        }
                    }
                }
            }
            
            Spacer()
            
            // Right: Next watering
            VStack(alignment: .trailing, spacing: 8) {
                Text("Tưới tiếp theo")
                    .font(.caption)
                    .foregroundColor(.secondary)
                
                HStack {
                    Image(systemName: "drop.fill")
                        .foregroundColor(.blue)
                    Text(entry.nextWatering)
                        .font(.title2)
                        .bold()
                }
                
                Text(entry.nextWateringPlant)
                    .font(.caption)
                    .lineLimit(1)
            }
        }
        .padding()
        .widgetBackground(Color(UIColor.systemBackground))
    }
}

struct LargeWidgetView: View {
    let entry: PlantWidgetEntry
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Image(systemName: "leaf.fill")
                    .foregroundColor(.green)
                    .font(.title2)
                Text(widgetAppName)
                    .font(.title2)
                    .bold()
                Spacer()
                Text(Date(), style: .date)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }
            
            Divider()
            
            // Stats Row
            HStack(spacing: 24) {
                StatItem(icon: "leaf", value: "\(entry.plantCount)", label: "Cây trồng")
                StatItem(icon: "drop.fill", value: entry.nextWatering, label: "Tưới tiếp")
                if entry.hasOverdue {
                    StatItem(icon: "exclamationmark.triangle.fill", value: "!", label: "Quá hạn", color: .orange)
                }
            }
            
            Divider()
            
            // Next watering detail
            VStack(alignment: .leading, spacing: 8) {
                Text("Cây cần chăm sóc")
                    .font(.headline)
                
                HStack {
                    Image(systemName: "drop.circle.fill")
                        .foregroundColor(.blue)
                        .font(.title3)
                    VStack(alignment: .leading) {
                        Text(entry.nextWateringPlant)
                            .font(.body)
                            .bold()
                        Text("Tưới lúc \(entry.nextWatering)")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Link(destination: widgetAppURL) {
                        Text("Đã tưới")
                            .font(.caption)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(Color.green)
                            .foregroundColor(.white)
                            .cornerRadius(8)
                    }
                }
            }
            
            Spacer()
        }
        .padding()
        .widgetBackground(Color(UIColor.systemBackground))
    }
}

struct StatItem: View {
    let icon: String
    let value: String
    let label: String
    var color: Color = .primary
    
    var body: some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .foregroundColor(color == .primary ? .green : color)
                .font(.title2)
            Text(value)
                .font(.title3)
                .bold()
            Text(label)
                .font(.caption)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct MyGardenWidget: Widget {
    let kind: String = "MyGardenWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            MyGardenWidgetEntryView(entry: entry)
        }
        .configurationDisplayName(widgetAppName)
        .description("Xem nhanh lịch chăm sóc cây")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

extension View {
    func widgetBackground(_ backgroundView: some View) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            return containerBackground(for: .widget) {
                backgroundView
            }
        } else {
            return background(backgroundView)
        }
    }
}

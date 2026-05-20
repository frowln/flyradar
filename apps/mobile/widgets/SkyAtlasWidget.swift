// SkyAtlasWidget.swift
// Skeleton for a WidgetKit Lock Screen / Home Screen widget.
// This file is intentionally NOT compiled — it lives here as documentation.
// See CONFIG_PLUGIN_NEEDED.md for full setup instructions.
//
// To activate: add a Widget Extension target in Xcode, copy this file there,
// and wire up the shared App Group container.

import WidgetKit
import SwiftUI

// MARK: - Shared data model (mirrors what RN writes to App Group UserDefaults)

struct NextFlightEntry: TimelineEntry {
    let date: Date
    let originIATA: String
    let destinationIATA: String
    let departureISO: String
}

// MARK: - Timeline provider

struct Provider: TimelineProvider {
    private let suiteName = "group.com.skyatlas.app"
    private let defaultsKey = "skyatlas_next_flight"

    func placeholder(in context: Context) -> NextFlightEntry {
        NextFlightEntry(date: Date(), originIATA: "SFO", destinationIATA: "JFK", departureISO: "")
    }

    func getSnapshot(in context: Context, completion: @escaping (NextFlightEntry) -> Void) {
        completion(entry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<NextFlightEntry>) -> Void) {
        let e = entry()
        // Refresh every 15 minutes
        let next = Calendar.current.date(byAdding: .minute, value: 15, to: Date())!
        completion(Timeline(entries: [e], policy: .after(next)))
    }

    private func entry() -> NextFlightEntry {
        let defaults = UserDefaults(suiteName: suiteName)
        let origin = defaults?.string(forKey: "origin_iata") ?? "--"
        let dest   = defaults?.string(forKey: "dest_iata")   ?? "--"
        let depart = defaults?.string(forKey: "departure")   ?? ""
        return NextFlightEntry(date: Date(), originIATA: origin, destinationIATA: dest, departureISO: depart)
    }
}

// MARK: - Widget view

struct SkyAtlasWidgetEntryView: View {
    var entry: Provider.Entry

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("\(entry.originIATA) → \(entry.destinationIATA)")
                .font(.system(size: 18, weight: .bold, design: .monospaced))
                .foregroundColor(.white)
            if !entry.departureISO.isEmpty,
               let date = ISO8601DateFormatter().date(from: entry.departureISO) {
                Text(date, style: .relative)
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.6))
            }
        }
        .padding(12)
        .containerBackground(Color(red: 0.04, green: 0.04, blue: 0.08), for: .widget)
    }
}

// MARK: - Widget declaration

@main
struct SkyAtlasWidget: Widget {
    let kind: String = "SkyAtlasWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            SkyAtlasWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Next Flight")
        .description("See your upcoming flight at a glance.")
        .supportedFamilies([.systemSmall, .accessoryRectangular, .accessoryInline])
    }
}

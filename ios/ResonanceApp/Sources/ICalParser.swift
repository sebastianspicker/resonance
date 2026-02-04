import Foundation

struct ICalEvent {
    let id: String
    let summary: String
    let startDate: Date
    let endDate: Date
    let location: String?
}

enum ICalParser {
    static func parse(_ raw: String) -> [ICalEvent] {
        let lines = unfoldLines(raw)
        var events: [ICalEvent] = []
        var current: [String: String] = [:]
        var inEvent = false

        for line in lines {
            if line == "BEGIN:VEVENT" {
                inEvent = true
                current = [:]
                continue
            }
            if line == "END:VEVENT" {
                if let summary = current["SUMMARY"],
                   let dtStart = current["DTSTART"],
                   let dtEnd = current["DTEND"],
                   let startDate = parseDate(dtStart),
                   let endDate = parseDate(dtEnd) {
                    let uid = current["UID"] ?? UUID().uuidString
                    let location = current["LOCATION"]
                    events.append(ICalEvent(id: uid, summary: summary, startDate: startDate, endDate: endDate, location: location))
                }
                inEvent = false
                continue
            }
            if inEvent {
                let parts = line.split(separator: ":", maxSplits: 1).map(String.init)
                if parts.count == 2 {
                    let key = parts[0].split(separator: ";").first.map(String.init) ?? parts[0]
                    current[key] = parts[1]
                }
            }
        }

        return events
    }

    private static func unfoldLines(_ raw: String) -> [String] {
        var result: [String] = []
        var buffer = ""
        for line in raw.split(whereSeparator: \CharacterSet.newlines.contains) {
            if line.first == " " || line.first == "\t" {
                buffer += line.dropFirst()
            } else {
                if !buffer.isEmpty {
                    result.append(buffer)
                }
                buffer = String(line)
            }
        }
        if !buffer.isEmpty {
            result.append(buffer)
        }
        return result
    }

    private static func parseDate(_ value: String) -> Date? {
        let cleaned = value.replacingOccurrences(of: "Z", with: "")
        if cleaned.count == 8 {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyyMMdd"
            formatter.timeZone = TimeZone.current
            return formatter.date(from: cleaned)
        }
        if cleaned.count >= 15 {
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyyMMdd'T'HHmmss"
            formatter.timeZone = TimeZone.current
            return formatter.date(from: cleaned)
        }
        return nil
    }
}

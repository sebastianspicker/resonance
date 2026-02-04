import Foundation
import UIKit

struct PDFExporter {
    static func export(entries: [LocalPracticeEntry], to url: URL) throws {
        let renderer = UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 612, height: 792))
        try renderer.writePDF(to: url, withActions: { context in
            context.beginPage()
            var y: CGFloat = 24
            let titleAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.boldSystemFont(ofSize: 18)
            ]
            let bodyAttributes: [NSAttributedString.Key: Any] = [
                .font: UIFont.systemFont(ofSize: 12)
            ]
            "Resonance Export".draw(at: CGPoint(x: 24, y: y), withAttributes: titleAttributes)
            y += 28

            for entry in entries {
                let line = "\(entry.practiceDate.formatted(date: .abbreviated, time: .shortened)) — \(entry.goalText)"
                line.draw(at: CGPoint(x: 24, y: y), withAttributes: bodyAttributes)
                y += 18
                if let notes = entry.notes, !notes.isEmpty {
                    notes.draw(at: CGPoint(x: 24, y: y), withAttributes: bodyAttributes)
                    y += 18
                }
                y += 10
                if y > 720 {
                    context.beginPage()
                    y = 24
                }
            }
        })
    }
}

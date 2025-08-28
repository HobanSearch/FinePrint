# Privacy Analysis Scraping Suite

Comprehensive web scraping tools for collecting privacy policies, terms of service, and app permissions data to create LoRA training datasets for Fine Print AI.

## Overview

This suite includes specialized scrapers for:
- **Websites**: Re-analyze failed sites using Puppeteer stealth techniques
- **iOS Apps**: Top 50 apps from App Store with privacy labels
- **Android Apps**: Top 50 apps from Google Play with data safety info
- **Chrome Extensions**: Top 50 extensions with permissions analysis

## Features

### Stealth Scraping
- Puppeteer with anti-detection plugins
- User agent rotation
- Cookie consent handling
- Rate limiting and retry logic
- Screenshot capture for verification

### Data Collection
- Privacy policy text extraction
- Terms of service analysis
- App permissions and privacy labels
- Pattern detection (50+ privacy patterns)
- Risk scoring and grading (A-F)

### Training Data Generation
- Unified pipeline for all data sources
- LoRA-compatible format generation
- Instruction-response pairs
- Pattern context extraction
- Quality metrics and statistics

## Quick Start

```bash
# Install dependencies (run from backend directory)
npm install

# Run all scrapers and generate training data
npm run scrape:all

# Or run individual scrapers
npm run scrape:failed-sites  # Re-analyze failed websites
npm run scrape:ios          # iOS App Store analysis
npm run scrape:android      # Google Play Store analysis
npm run scrape:chrome       # Chrome Web Store analysis

# Generate unified training dataset
npm run training:generate
```

## Output Files

After running the comprehensive analysis:

- `failed-sites-reanalysis.json` - Re-analyzed website data
- `ios-app-analysis.json` - iOS app privacy analysis
- `google-play-analysis.json` - Android app privacy analysis
- `chrome-extensions-analysis.json` - Browser extension analysis
- `unified-training-data.json` - Combined dataset with patterns
- `lora-training-dataset.json` - LoRA format training data
- `lora-training-dataset.jsonl` - JSONL format for training
- `training-data-statistics.json` - Dataset quality metrics

## Privacy Patterns Detected

The scrapers detect 50+ privacy patterns including:
- Data collection and sharing
- Third-party integrations
- Legal waivers (arbitration, class action)
- Data retention policies
- Children's privacy (COPPA)
- Advertising and tracking
- Security practices
- Compliance (GDPR, CCPA)

## Ethical Scraping

All scrapers implement:
- Rate limiting (2-4 seconds between requests)
- Retry logic with exponential backoff
- User agent identification
- Robots.txt compliance
- Cookie consent handling
- Respectful resource usage

## Training Data Format

The generated LoRA dataset includes:

```json
{
  "instruction": "Analyze the following privacy_policy for privacy concerns...",
  "input": "<document text>",
  "output": "Analysis of Company Name:\n\nRisk Score: 75/100\nGrade: C\n\nProblematic patterns detected:\n- data_sharing (high severity): 5 instances\n- third_party_sharing (medium severity): 12 instances",
  "metadata": {
    "source_type": "website",
    "document_type": "privacy_policy",
    "risk_score": 75,
    "grade": "C"
  }
}
```

## Performance

Typical execution times:
- Failed sites analysis: ~30 minutes (12 sites)
- iOS App Store: ~45-60 minutes (50 apps)
- Google Play Store: ~45-60 minutes (50 apps)
- Chrome Web Store: ~45-60 minutes (50 extensions)
- Total comprehensive run: ~2-3 hours

## Requirements

- Node.js 18+ 
- 4GB+ RAM (for Puppeteer)
- Chrome/Chromium installed
- Stable internet connection
- ~500MB disk space for outputs

## Troubleshooting

### Puppeteer Issues
```bash
# If Puppeteer fails to launch
npx puppeteer browsers install chrome
```

### Rate Limiting
Adjust rate limits in scraper configurations if encountering blocks:
```javascript
rateLimit: 4000,  // Increase delay between requests (ms)
retries: 5,       // Increase retry attempts
```

### Memory Issues
For low-memory systems, reduce concurrency:
```javascript
maxConcurrency: 1,  // Process one item at a time
```

## Next Steps

After generating the training dataset:

1. Review the data quality:
   ```bash
   cat training-data-statistics.json
   ```

2. Copy to training directory:
   ```bash
   cp lora-training-dataset.jsonl ../training/
   ```

3. Run LoRA fine-tuning:
   ```bash
   cd ../training && python train-lora.py
   ```

## Contributing

When adding new scrapers:
1. Extend the `StealthScraper` base class
2. Implement pattern detection for the platform
3. Add to `unified-training-pipeline.js`
4. Update this README

## License

Part of Fine Print AI - see main project license.
import puppeteer, { Browser, Page } from 'puppeteer';
import { beforeAll, beforeEach, afterAll, afterEach } from '@jest/globals';
import path from 'path';
import fs from 'fs';

// Global browser and page instances
declare global {
  var browser: Browser;
  var page: Page;
  var extensionId: string;
}

// Extension testing utilities
export class ExtensionTestUtils {
  static async loadExtension(browser: Browser, extensionPath: string): Promise<string> {
    const targets = await browser.targets();
    const extensionTarget = targets.find(
      target => target.type() === 'service_worker' && target.url().includes('chrome-extension://')
    );
    
    if (!extensionTarget) {
      throw new Error('Extension not loaded properly');
    }
    
    const extensionUrl = extensionTarget.url();
    const extensionId = extensionUrl.split('/')[2];
    
    console.log(`Extension loaded with ID: ${extensionId}`);
    return extensionId;
  }

  static async openExtensionPopup(page: Page, extensionId: string): Promise<Page> {
    const popupUrl = `chrome-extension://${extensionId}/popup/index.html`;
    
    // Open popup in new page
    const popupPage = await page.browser().newPage();
    await popupPage.goto(popupUrl);
    
    return popupPage;
  }

  static async openExtensionOptions(page: Page, extensionId: string): Promise<Page> {
    const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    
    const optionsPage = await page.browser().newPage();
    await optionsPage.goto(optionsUrl);
    
    return optionsPage;
  }

  static async injectContentScript(page: Page, scriptPath: string): Promise<void> {
    const scriptContent = fs.readFileSync(scriptPath, 'utf8');
    await page.evaluateOnNewDocument(scriptContent);
  }

  static async waitForElement(page: Page, selector: string, timeout = 5000): Promise<void> {
    try {
      await page.waitForSelector(selector, { timeout });
    } catch (error) {
      throw new Error(`Element not found within ${timeout}ms: ${selector}`);
    }
  }

  static async waitForExtensionMessage(page: Page, messageType: string, timeout = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Extension message '${messageType}' not received within ${timeout}ms`));
      }, timeout);

      page.on('console', (msg) => {
        if (msg.text().includes(messageType)) {
          clearTimeout(timer);
          resolve(JSON.parse(msg.text().replace(messageType + ':', '')));
        }
      });
    });
  }

  static async simulateUserInteraction(page: Page, selector: string, action: 'click' | 'hover' | 'focus'): Promise<void> {
    const element = await page.$(selector);
    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    switch (action) {
      case 'click':
        await element.click();
        break;
      case 'hover':
        await element.hover();
        break;
      case 'focus':
        await element.focus();
        break;
    }
  }

  static async testOnMultipleSites(
    callback: (page: Page, url: string) => Promise<void>,
    sites: string[] = [
      'https://google.com/privacy',
      'https://facebook.com/privacy',
      'https://twitter.com/privacy',
      'https://amazon.com/gp/help/customer/display.html?nodeId=468496'
    ]
  ): Promise<void> {
    for (const site of sites) {
      console.log(`Testing on site: ${site}`);
      await global.page.goto(site, { waitUntil: 'networkidle2' });
      await callback(global.page, site);
    }
  }

  static async measurePerformance(
    page: Page,
    action: () => Promise<void>
  ): Promise<{ duration: number; metrics: any }> {
    // Start performance measurement
    await page.tracing.start({ path: 'performance-trace.json', categories: ['devtools.timeline'] });
    
    const startTime = Date.now();
    await action();
    const endTime = Date.now();
    
    await page.tracing.stop();
    
    const metrics = await page.metrics();
    
    return {
      duration: endTime - startTime,
      metrics
    };
  }

  static async checkAccessibility(page: Page): Promise<any[]> {
    // Inject axe-core for accessibility testing
    await page.addScriptTag({
      url: 'https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.7.2/axe.min.js'
    });

    // Run accessibility checks
    const results = await page.evaluate(() => {
      return new Promise((resolve) => {
        // @ts-ignore
        axe.run((err, results) => {
          if (err) throw err;
          resolve(results);
        });
      });
    });

    return results as any[];
  }

  static async mockApiResponse(page: Page, url: string, response: any): Promise<void> {
    await page.setRequestInterception(true);
    
    page.on('request', (req) => {
      if (req.url().includes(url)) {
        req.respond({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(response)
        });
      } else {
        req.continue();
      }
    });
  }

  static async captureNetworkActivity(page: Page): Promise<any[]> {
    const requests: any[] = [];
    
    page.on('request', (request) => {
      requests.push({
        type: 'request',
        url: request.url(),
        method: request.method(),
        headers: request.headers(),
        timestamp: Date.now()
      });
    });

    page.on('response', (response) => {
      requests.push({
        type: 'response',
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: Date.now()
      });
    });

    return requests;
  }

  static async testCrossOriginIsolation(page: Page): Promise<boolean> {
    const crossOriginIsolated = await page.evaluate(() => {
      return window.crossOriginIsolated;
    });

    return crossOriginIsolated;
  }

  static async simulateNetworkConditions(
    page: Page, 
    condition: 'offline' | 'slow3g' | 'fast3g' | 'online'
  ): Promise<void> {
    const conditions = {
      offline: { offline: true, downloadThroughput: 0, uploadThroughput: 0, latency: 0 },
      slow3g: { offline: false, downloadThroughput: 50 * 1024, uploadThroughput: 50 * 1024, latency: 2000 },
      fast3g: { offline: false, downloadThroughput: 1.6 * 1024 * 1024, uploadThroughput: 750 * 1024, latency: 150 },
      online: { offline: false, downloadThroughput: 10 * 1024 * 1024, uploadThroughput: 10 * 1024 * 1024, latency: 0 }
    };

    const client = await page.target().createCDPSession();
    await client.send('Network.emulateNetworkConditions', conditions[condition]);
  }
}

// Global test setup
beforeAll(async () => {
  console.log('🚀 Starting extension test suite...');
  
  const extensionPath = path.resolve(__dirname, '..', 'dist');
  
  // Ensure extension is built
  if (!fs.existsSync(extensionPath)) {
    throw new Error('Extension not built. Run "npm run build" first.');
  }

  // Launch browser with extension
  global.browser = await puppeteer.launch({
    headless: process.env.CI ? 'new' : false,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-web-security',
      '--disable-features=TranslateUI',
      '--disable-ipc-flooding-protection'
    ],
    defaultViewport: {
      width: 1280,
      height: 720
    }
  });

  global.page = await global.browser.newPage();
  
  // Enable console logging
  global.page.on('console', (msg) => {
    if (process.env.DEBUG) {
      console.log('PAGE LOG:', msg.text());
    }
  });

  // Load extension and get ID
  global.extensionId = await ExtensionTestUtils.loadExtension(global.browser, extensionPath);
  
  console.log('✅ Extension test environment ready');
});

beforeEach(async () => {
  // Clear browser data before each test
  const client = await global.page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');
  await client.send('Network.clearBrowserCache');
  
  // Reset page
  await global.page.goto('about:blank');
});

afterEach(async () => {
  // Close any additional pages opened during test
  const pages = await global.browser.pages();
  for (const page of pages.slice(1)) { // Keep the main page
    await page.close();
  }
});

afterAll(async () => {
  console.log('🧹 Cleaning up extension test environment...');
  
  if (global.browser) {
    await global.browser.close();
  }
  
  console.log('✅ Extension test cleanup completed');
});

// Global error handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
});

export { ExtensionTestUtils };
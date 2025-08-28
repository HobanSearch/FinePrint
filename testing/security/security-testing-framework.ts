import { Page } from 'playwright';
import axios from 'axios';
import crypto from 'crypto';

export interface SecurityVulnerability {
  id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: string;
  title: string;
  description: string;
  impact: string;
  recommendation: string;
  evidence: string[];
  cwe?: string;
  owasp?: string;
}

export interface SecurityTestResult {
  testName: string;
  passed: boolean;
  vulnerabilities: SecurityVulnerability[];
  timestamp: string;
  url?: string;
}

export interface SecurityReport {
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    passed: number;
    failed: number;
  };
  tests: SecurityTestResult[];
  timestamp: string;
  recommendations: string[];
}

export class SecurityTester {
  private baseUrl: string;
  private authToken?: string;

  constructor(baseUrl: string = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
  }

  async setAuthToken(token: string): Promise<void> {
    this.authToken = token;
  }

  async testSQLInjection(endpoints: string[]): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityVulnerability[] = [];
    const sqlPayloads = [
      "' OR '1'='1",
      "'; DROP TABLE users; --",
      "' UNION SELECT * FROM users --",
      "admin'--",
      "' OR 1=1 --",
      "') OR ('1'='1",
      "1' AND (SELECT COUNT(*) FROM users) > 0 --"
    ];

    for (const endpoint of endpoints) {
      for (const payload of sqlPayloads) {
        try {
          // Test query parameters
          const response = await axios.get(`${this.baseUrl}${endpoint}`, {
            params: { q: payload, search: payload, id: payload },
            timeout: 10000,
            validateStatus: () => true
          });

          // Check for SQL error messages or unexpected data
          const responseText = JSON.stringify(response.data).toLowerCase();
          const sqlErrorPatterns = [
            'sql syntax',
            'mysql_fetch',
            'ora-',
            'microsoft ole db',
            'unclosed quotation mark',
            'quoted string not properly terminated'
          ];

          const hasSqlError = sqlErrorPatterns.some(pattern => 
            responseText.includes(pattern)
          );

          if (hasSqlError || response.status === 500) {
            vulnerabilities.push({
              id: `sql-injection-${endpoint}-${payload.slice(0, 10)}`,
              severity: 'critical',
              category: 'Injection',
              title: 'SQL Injection Vulnerability',
              description: `Endpoint ${endpoint} appears vulnerable to SQL injection`,
              impact: 'Attackers could potentially access, modify, or delete database data',
              recommendation: 'Use parameterized queries and input validation',
              evidence: [
                `Payload: ${payload}`,
                `Response status: ${response.status}`,
                `Error indicators found in response`
              ],
              cwe: 'CWE-89',
              owasp: 'A03:2021 – Injection'
            });
          }

        } catch (error) {
          // Timeout or connection errors might indicate successful injection
          if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
            vulnerabilities.push({
              id: `sql-injection-timeout-${endpoint}`,
              severity: 'high',
              category: 'Injection',
              title: 'Potential SQL Injection (Timeout)',
              description: `Endpoint ${endpoint} timed out with SQL payload, indicating possible injection`,
              impact: 'Potential database access or denial of service',
              recommendation: 'Investigate timeout behavior and implement proper input validation',
              evidence: [`Payload: ${payload}`, `Error: ${error.message}`],
              cwe: 'CWE-89',
              owasp: 'A03:2021 – Injection'
            });
          }
        }
      }
    }

    return {
      testName: 'SQL Injection Test',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      timestamp: new Date().toISOString()
    };
  }

  async testXSS(page: Page, forms: string[]): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityVulnerability[] = [];
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '"><script>alert("XSS")</script>',
      "';alert('XSS');//",
      '<img src=x onerror=alert("XSS")>',
      'javascript:alert("XSS")',
      '<svg onload=alert("XSS")>',
      '"><iframe src=javascript:alert("XSS")></iframe>'
    ];

    for (const formSelector of forms) {
      await page.goto(this.baseUrl);
      
      try {
        await page.waitForSelector(formSelector, { timeout: 5000 });
        
        for (const payload of xssPayloads) {
          // Fill form inputs with XSS payload
          const inputs = await page.locator(`${formSelector} input, ${formSelector} textarea`).all();
          
          for (const input of inputs) {
            const inputType = await input.getAttribute('type');
            if (inputType !== 'hidden' && inputType !== 'submit') {
              await input.fill(payload);
            }
          }

          // Submit form
          await page.locator(`${formSelector} [type="submit"], ${formSelector} button[type="submit"]`).click();
          
          // Wait for response
          await page.waitForTimeout(2000);
          
          // Check if XSS payload was executed or reflected
          const pageContent = await page.content();
          const hasReflectedXSS = pageContent.includes(payload) && 
                               !pageContent.includes(`&lt;script&gt;`) && // Not escaped
                               !pageContent.includes(`&amp;lt;script&amp;gt;`); // Not double escaped

          // Check for script execution
          const alertFired = await page.evaluate(() => {
            return window.hasOwnProperty('__xss_test_fired__');
          });

          if (hasReflectedXSS || alertFired) {
            vulnerabilities.push({
              id: `xss-${formSelector}-${payload.slice(0, 10)}`,
              severity: 'high',
              category: 'Cross-Site Scripting',
              title: 'Cross-Site Scripting (XSS) Vulnerability',
              description: `Form ${formSelector} is vulnerable to XSS attacks`,
              impact: 'Attackers could execute malicious scripts in user browsers',
              recommendation: 'Implement proper input validation and output encoding',
              evidence: [
                `Form: ${formSelector}`,
                `Payload: ${payload}`,
                `Reflected: ${hasReflectedXSS}`,
                `Script executed: ${alertFired}`
              ],
              cwe: 'CWE-79',
              owasp: 'A03:2021 – Injection'
            });
          }
        }
      } catch (error) {
        console.warn(`Could not test form ${formSelector}: ${error.message}`);
      }
    }

    return {
      testName: 'Cross-Site Scripting (XSS) Test',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      timestamp: new Date().toISOString(),
      url: page.url()
    };
  }

  async testCSRF(page: Page): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      // Check for CSRF tokens in forms
      await page.goto(this.baseUrl);
      
      const forms = await page.locator('form').all();
      
      for (let i = 0; i < forms.length; i++) {
        const form = forms[i];
        const action = await form.getAttribute('action');
        const method = await form.getAttribute('method');
        
        if (method?.toLowerCase() === 'post') {
          // Check for CSRF token
          const hasCSRFToken = await form.locator('input[name*="csrf"], input[name*="token"], input[name="_token"]').count() > 0;
          
          if (!hasCSRFToken) {
            vulnerabilities.push({
              id: `csrf-missing-token-form-${i}`,
              severity: 'high',
              category: 'Cross-Site Request Forgery',
              title: 'Missing CSRF Protection',
              description: `Form ${i} (action: ${action}) lacks CSRF protection`,
              impact: 'Attackers could perform unauthorized actions on behalf of users',
              recommendation: 'Implement CSRF tokens for all state-changing operations',
              evidence: [
                `Form action: ${action}`,
                `Method: ${method}`,
                `No CSRF token found`
              ],
              cwe: 'CWE-352',
              owasp: 'A01:2021 – Broken Access Control'
            });
          }
        }
      }

      // Test for CSRF by attempting cross-origin requests
      const testEndpoints = ['/api/users', '/api/documents', '/api/settings'];
      
      for (const endpoint of testEndpoints) {
        try {
          const response = await axios.post(`${this.baseUrl}${endpoint}`, {
            test: 'csrf_test'
          }, {
            headers: {
              'Origin': 'http://malicious-site.com',
              'Referer': 'http://malicious-site.com'
            },
            timeout: 5000,
            validateStatus: () => true
          });

          // If request succeeds without CSRF protection, it's vulnerable
          if (response.status < 400) {
            vulnerabilities.push({
              id: `csrf-vulnerable-${endpoint}`,
              severity: 'high',
              category: 'Cross-Site Request Forgery',
              title: 'CSRF Protection Bypass',
              description: `Endpoint ${endpoint} accepts cross-origin requests without CSRF protection`,
              impact: 'Cross-site request forgery attacks possible',
              recommendation: 'Implement proper CSRF protection and origin validation',
              evidence: [
                `Endpoint: ${endpoint}`,
                `Response status: ${response.status}`,
                `Cross-origin request accepted`
              ],
              cwe: 'CWE-352',
              owasp: 'A01:2021 – Broken Access Control'
            });
          }
        } catch (error) {
          // Expected behavior - CSRF protection should block the request
        }
      }

    } catch (error) {
      console.warn(`CSRF test failed: ${error.message}`);
    }

    return {
      testName: 'Cross-Site Request Forgery (CSRF) Test',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      timestamp: new Date().toISOString(),
      url: page.url()
    };
  }

  async testAuthentication(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      // Test for weak authentication
      const weakCredentials = [
        { username: 'admin', password: 'admin' },
        { username: 'admin', password: 'password' },
        { username: 'admin', password: '123456' },
        { username: 'user', password: 'user' },
        { username: 'test', password: 'test' }
      ];

      for (const creds of weakCredentials) {
        try {
          const response = await axios.post(`${this.baseUrl}/api/auth/login`, creds, {
            timeout: 5000,
            validateStatus: () => true
          });

          if (response.status === 200 || response.data?.token) {
            vulnerabilities.push({
              id: `weak-credentials-${creds.username}`,
              severity: 'critical',
              category: 'Authentication',
              title: 'Weak Default Credentials',
              description: `Default credentials accepted: ${creds.username}/${creds.password}`,
              impact: 'Unauthorized access to the application',
              recommendation: 'Remove default credentials and enforce strong password policies',
              evidence: [
                `Username: ${creds.username}`,
                `Password: ${creds.password}`,
                `Login successful`
              ],
              cwe: 'CWE-521',
              owasp: 'A07:2021 – Identification and Authentication Failures'
            });
          }
        } catch (error) {
          // Expected - weak credentials should be rejected
        }
      }

      // Test for session fixation
      try {
        const initialResponse = await axios.get(`${this.baseUrl}/api/auth/session`, {
          timeout: 5000,
          validateStatus: () => true
        });

        const initialSession = initialResponse.headers['set-cookie']?.[0];

        if (initialSession) {
          // Try to login with the same session
          const loginResponse = await axios.post(`${this.baseUrl}/api/auth/login`, {
            username: 'testuser@example.com',
            password: 'testpassword'
          }, {
            headers: {
              'Cookie': initialSession
            },
            timeout: 5000,
            validateStatus: () => true
          });

          const finalSession = loginResponse.headers['set-cookie']?.[0];

          // If session ID doesn't change after login, it's vulnerable to session fixation
          if (initialSession === finalSession && loginResponse.status === 200) {
            vulnerabilities.push({
              id: 'session-fixation',
              severity: 'medium',
              category: 'Session Management',
              title: 'Session Fixation Vulnerability',
              description: 'Session ID does not change after authentication',
              impact: 'Attackers could hijack user sessions',
              recommendation: 'Generate new session ID after successful authentication',
              evidence: [
                'Session ID remains the same after login',
                `Initial session: ${initialSession}`,
                `Final session: ${finalSession}`
              ],
              cwe: 'CWE-384',
              owasp: 'A07:2021 – Identification and Authentication Failures'
            });
          }
        }
      } catch (error) {
        // Session management test failed
      }

      // Test for JWT vulnerabilities
      if (this.authToken) {
        try {
          const jwtParts = this.authToken.split('.');
          if (jwtParts.length === 3) {
            // Check for weak JWT algorithm
            const header = JSON.parse(Buffer.from(jwtParts[0], 'base64').toString());
            
            if (header.alg === 'none') {
              vulnerabilities.push({
                id: 'jwt-none-algorithm',
                severity: 'critical',
                category: 'Authentication',
                title: 'JWT with None Algorithm',
                description: 'JWT tokens use "none" algorithm, bypassing signature verification',
                impact: 'Token forgery and unauthorized access',
                recommendation: 'Use strong signing algorithms (RS256, HS256)',
                evidence: [`JWT algorithm: ${header.alg}`],
                cwe: 'CWE-347',
                owasp: 'A07:2021 – Identification and Authentication Failures'
              });
            }

            // Check for weak secrets (if HS256)
            if (header.alg === 'HS256') {
              const weakSecrets = ['secret', '123456', 'password', 'jwt-secret'];
              
              for (const secret of weakSecrets) {
                try {
                  const crypto = require('crypto');
                  const signature = crypto
                    .createHmac('sha256', secret)
                    .update(`${jwtParts[0]}.${jwtParts[1]}`)
                    .digest('base64url');

                  if (signature === jwtParts[2]) {
                    vulnerabilities.push({
                      id: 'jwt-weak-secret',
                      severity: 'critical',
                      category: 'Authentication',
                      title: 'JWT Weak Secret',
                      description: `JWT signed with weak secret: ${secret}`,
                      impact: 'Token forgery and privilege escalation',
                      recommendation: 'Use cryptographically strong random secrets',
                      evidence: [`Weak secret: ${secret}`],
                      cwe: 'CWE-326',
                      owasp: 'A07:2021 – Identification and Authentication Failures'
                    });
                    break;
                  }
                } catch (error) {
                  // Continue testing other secrets
                }
              }
            }
          }
        } catch (error) {
          // JWT parsing failed
        }
      }

    } catch (error) {
      console.warn(`Authentication test failed: ${error.message}`);
    }

    return {
      testName: 'Authentication Security Test',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      timestamp: new Date().toISOString()
    };
  }

  async testSecurityHeaders(): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      const response = await axios.get(this.baseUrl, {
        timeout: 10000,
        validateStatus: () => true
      });

      const headers = response.headers;

      // Check for missing security headers
      const requiredHeaders = {
        'x-content-type-options': {
          expected: 'nosniff',
          severity: 'medium' as const,
          description: 'Prevents MIME type sniffing attacks'
        },
        'x-frame-options': {
          expected: ['DENY', 'SAMEORIGIN'],
          severity: 'medium' as const,
          description: 'Prevents clickjacking attacks'
        },
        'x-xss-protection': {
          expected: '1; mode=block',
          severity: 'low' as const,
          description: 'Enables XSS filtering in browsers'
        },
        'strict-transport-security': {
          expected: null, // Any value is good
          severity: 'high' as const,
          description: 'Enforces HTTPS connections'
        },
        'content-security-policy': {
          expected: null,
          severity: 'high' as const,
          description: 'Prevents XSS and data injection attacks'
        },
        'referrer-policy': {
          expected: ['strict-origin-when-cross-origin', 'no-referrer', 'same-origin'],
          severity: 'low' as const,
          description: 'Controls referrer information sent with requests'
        }
      };

      for (const [headerName, config] of Object.entries(requiredHeaders)) {
        const headerValue = headers[headerName];

        if (!headerValue) {
          vulnerabilities.push({
            id: `missing-header-${headerName}`,
            severity: config.severity,
            category: 'Security Headers',
            title: `Missing Security Header: ${headerName}`,
            description: `${config.description}`,
            impact: 'Increased risk of various attacks',
            recommendation: `Add ${headerName} header to HTTP responses`,
            evidence: [`Header ${headerName} not found in response`],
            cwe: 'CWE-693',
            owasp: 'A05:2021 – Security Misconfiguration'
          });
        } else if (config.expected) {
          const expectedValues = Array.isArray(config.expected) ? config.expected : [config.expected];
          const isValid = expectedValues.some(expected => 
            headerValue.toLowerCase().includes(expected.toLowerCase())
          );

          if (!isValid) {
            vulnerabilities.push({
              id: `invalid-header-${headerName}`,
              severity: config.severity,
              category: 'Security Headers',
              title: `Invalid Security Header: ${headerName}`,
              description: `Header has unexpected value: ${headerValue}`,
              impact: 'Reduced security protection',
              recommendation: `Set ${headerName} to appropriate value: ${expectedValues.join(' or ')}`,
              evidence: [
                `Current value: ${headerValue}`,
                `Expected: ${expectedValues.join(' or ')}`
              ],
              cwe: 'CWE-693',
              owasp: 'A05:2021 – Security Misconfiguration'
            });
          }
        }
      }

      // Check for information disclosure headers
      const sensitiveHeaders = ['server', 'x-powered-by', 'x-aspnet-version'];
      
      for (const headerName of sensitiveHeaders) {
        if (headers[headerName]) {
          vulnerabilities.push({
            id: `info-disclosure-${headerName}`,
            severity: 'low',
            category: 'Information Disclosure',
            title: `Information Disclosure: ${headerName}`,
            description: `Server exposes technology information via ${headerName} header`,
            impact: 'Helps attackers identify potential vulnerabilities',
            recommendation: `Remove or modify ${headerName} header`,
            evidence: [`${headerName}: ${headers[headerName]}`],
            cwe: 'CWE-200',
            owasp: 'A05:2021 – Security Misconfiguration'
          });
        }
      }

    } catch (error) {
      console.warn(`Security headers test failed: ${error.message}`);
    }

    return {
      testName: 'Security Headers Test',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      timestamp: new Date().toISOString(),
      url: this.baseUrl
    };
  }

  async testFileUploadSecurity(page: Page, uploadSelector: string): Promise<SecurityTestResult> {
    const vulnerabilities: SecurityVulnerability[] = [];

    try {
      await page.goto(this.baseUrl);
      await page.waitForSelector(uploadSelector, { timeout: 5000 });

      // Test malicious file uploads
      const maliciousFiles = [
        {
          name: 'test.php',
          content: '<?php system($_GET["cmd"]); ?>',
          type: 'Executable Script'
        },
        {
          name: 'test.jsp',
          content: '<% Runtime.getRuntime().exec(request.getParameter("cmd")); %>',
          type: 'Executable Script'
        },
        {
          name: 'test.svg',
          content: '<svg onload="alert(\'XSS\')"><script>alert("XSS")</script></svg>',
          type: 'XSS Vector'
        },
        {
          name: '../../../etc/passwd',
          content: 'directory traversal test',
          type: 'Directory Traversal'
        }
      ];

      for (const file of maliciousFiles) {
        try {
          // Create temporary file
          const fs = require('fs');
          const path = require('path');
          const tempFilePath = path.join(__dirname, 'temp', file.name);
          
          // Ensure temp directory exists
          const tempDir = path.dirname(tempFilePath);
          if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
          }
          
          fs.writeFileSync(tempFilePath, file.content);

          // Attempt upload
          await page.setInputFiles(uploadSelector, tempFilePath);
          
          // Look for upload success/error messages
          await page.waitForTimeout(2000);
          
          const pageContent = await page.content();
          const uploadSuccessful = pageContent.includes('uploaded') || 
                                 pageContent.includes('success') ||
                                 !pageContent.includes('error');

          if (uploadSuccessful) {
            vulnerabilities.push({
              id: `malicious-upload-${file.type.toLowerCase().replace(' ', '-')}`,
              severity: file.type === 'Executable Script' ? 'critical' : 'high',
              category: 'File Upload',
              title: `Malicious File Upload: ${file.type}`,
              description: `System accepts ${file.type.toLowerCase()} files (${file.name})`,
              impact: file.type === 'Executable Script' ? 
                     'Remote code execution possible' : 
                     'XSS or directory traversal attacks possible',
              recommendation: 'Implement strict file type validation and sanitization',
              evidence: [
                `File: ${file.name}`,
                `Type: ${file.type}`,
                `Upload appeared successful`
              ],
              cwe: 'CWE-434',
              owasp: 'A03:2021 – Injection'
            });
          }

          // Cleanup
          fs.unlinkSync(tempFilePath);

        } catch (error) {
          // Upload failed - good for security
        }
      }

      // Test file size limits
      try {
        const largeFileSize = 100 * 1024 * 1024; // 100MB
        const largeContent = Buffer.alloc(largeFileSize, 'A');
        const largeFilePath = path.join(__dirname, 'temp', 'large-file.txt');
        
        fs.writeFileSync(largeFilePath, largeContent);
        
        await page.setInputFiles(uploadSelector, largeFilePath);
        await page.waitForTimeout(5000);
        
        const pageContent = await page.content();
        const uploadSuccessful = pageContent.includes('uploaded') || 
                               pageContent.includes('success');

        if (uploadSuccessful) {
          vulnerabilities.push({
            id: 'no-file-size-limit',
            severity: 'medium',
            category: 'File Upload',
            title: 'No File Size Limit',
            description: 'System accepts extremely large files',
            impact: 'Denial of service through resource exhaustion',
            recommendation: 'Implement reasonable file size limits',
            evidence: [`Large file (${largeFileSize} bytes) accepted`],
            cwe: 'CWE-770',
            owasp: 'A05:2021 – Security Misconfiguration'
          });
        }

        fs.unlinkSync(largeFilePath);

      } catch (error) {
        // Expected - large files should be rejected
      }

    } catch (error) {
      console.warn(`File upload security test failed: ${error.message}`);
    }

    return {
      testName: 'File Upload Security Test',
      passed: vulnerabilities.length === 0,
      vulnerabilities,
      timestamp: new Date().toISOString(),
      url: page.url()
    };
  }

  async generateSecurityReport(results: SecurityTestResult[]): Promise<SecurityReport> {
    const allVulnerabilities = results.flatMap(r => r.vulnerabilities);
    
    const summary = {
      total: allVulnerabilities.length,
      critical: allVulnerabilities.filter(v => v.severity === 'critical').length,
      high: allVulnerabilities.filter(v => v.severity === 'high').length,
      medium: allVulnerabilities.filter(v => v.severity === 'medium').length,
      low: allVulnerabilities.filter(v => v.severity === 'low').length,
      passed: results.filter(r => r.passed).length,
      failed: results.filter(r => !r.passed).length
    };

    const recommendations = [
      'Implement input validation and sanitization for all user inputs',
      'Use parameterized queries to prevent SQL injection',
      'Add comprehensive security headers to all HTTP responses',
      'Implement proper CSRF protection for state-changing operations',
      'Use strong authentication mechanisms and enforce password policies',
      'Regularly update dependencies and scan for vulnerabilities',
      'Implement proper error handling to prevent information disclosure',
      'Use HTTPS for all communications and implement HSTS',
      'Implement proper session management and timeout mechanisms',
      'Regular security testing and code reviews'
    ];

    return {
      summary,
      tests: results,
      timestamp: new Date().toISOString(),
      recommendations
    };
  }

  async runFullSecuritySuite(page: Page): Promise<SecurityReport> {
    console.log('🔒 Starting comprehensive security testing suite...');
    
    const results: SecurityTestResult[] = [];

    // Run all security tests
    const tests = [
      () => this.testSecurityHeaders(),
      () => this.testAuthentication(),
      () => this.testSQLInjection(['/api/users', '/api/documents', '/api/search']),
      () => this.testXSS(page, ['form', '[data-testid*="form"]']),
      () => this.testCSRF(page),
    ];

    // Check for file upload functionality
    const hasFileUpload = await page.locator('input[type="file"]').count() > 0;
    if (hasFileUpload) {
      tests.push(() => this.testFileUploadSecurity(page, 'input[type="file"]'));
    }

    for (const test of tests) {
      try {
        const result = await test();
        results.push(result);
        console.log(`✓ ${result.testName}: ${result.passed ? 'PASSED' : 'FAILED'} (${result.vulnerabilities.length} vulnerabilities)`);
      } catch (error) {
        console.error(`✗ Test failed: ${error.message}`);
        results.push({
          testName: 'Unknown Test',
          passed: false,
          vulnerabilities: [{
            id: 'test-error',
            severity: 'medium',
            category: 'Testing',
            title: 'Test Execution Error',
            description: `Test failed to execute: ${error.message}`,
            impact: 'Unable to verify security controls',
            recommendation: 'Review test configuration and fix execution issues',
            evidence: [error.message]
          }],
          timestamp: new Date().toISOString()
        });
      }
    }

    const report = await this.generateSecurityReport(results);
    console.log(`🔒 Security testing completed: ${report.summary.failed} failed, ${report.summary.total} total vulnerabilities found`);
    
    return report;
  }
}

export default SecurityTester;
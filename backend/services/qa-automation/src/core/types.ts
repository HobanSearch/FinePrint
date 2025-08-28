export enum TestPhase {
  IDLE = 'idle',
  INITIALIZING = 'initializing',
  READY = 'ready',
  EXECUTING = 'executing',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  ERROR = 'error'
}

export enum TestType {
  UNIT = 'unit',
  INTEGRATION = 'integration',
  E2E = 'e2e',
  PERFORMANCE = 'performance',
  SECURITY = 'security',
  CONTRACT = 'contract',
  CHAOS = 'chaos',
  VISUAL = 'visual',
  ACCESSIBILITY = 'accessibility',
  MODEL = 'model'
}

export enum TestStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  FLAKY = 'flaky',
  TIMEOUT = 'timeout',
  ERROR = 'error'
}

export enum TestPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low'
}

export interface TestContext {
  environment: string;
  buildId: string;
  commitSha: string;
  branch: string;
  tags: string[];
  metadata: Map<string, any>;
  user?: string;
  timestamp?: number;
}

export interface TestCase {
  id: string;
  name: string;
  description?: string;
  type: TestType;
  priority: TestPriority;
  tags: string[];
  timeout?: number;
  retries?: number;
  flaky?: boolean;
  skip?: boolean;
  only?: boolean;
  beforeEach?: () => Promise<void>;
  afterEach?: () => Promise<void>;
  test: () => Promise<void>;
  assertions?: TestAssertion[];
  metadata?: Record<string, any>;
}

export interface TestSuite {
  id: string;
  name: string;
  description?: string;
  type: TestType;
  priority: TestPriority;
  tags: string[];
  parallel?: boolean;
  timeout?: number;
  retries?: number;
  beforeAll?: () => Promise<void>;
  afterAll?: () => Promise<void>;
  tests: TestCase[];
  suites?: TestSuite[];
  fixtures?: TestFixture[];
  metadata?: Record<string, any>;
}

export interface TestResult {
  id?: string;
  success: boolean;
  status?: TestStatus;
  duration: number;
  startTime?: number;
  endTime?: number;
  error?: Error;
  errors?: Error[];
  failures?: TestFailure[];
  tests: TestCaseResult[];
  coverage?: CoverageReport;
  performance?: PerformanceMetrics;
  screenshots?: string[];
  videos?: string[];
  traces?: string[];
  logs?: string[];
  metadata?: Record<string, any>;
}

export interface TestCaseResult {
  id: string;
  name: string;
  status: TestStatus;
  duration: number;
  attempts: number;
  error?: Error;
  assertions: AssertionResult[];
  logs?: string[];
  screenshots?: string[];
  metadata?: Record<string, any>;
}

export interface TestFailure {
  test: string;
  error: Error;
  stack?: string;
  screenshot?: string;
  video?: string;
  diff?: string;
  actual?: any;
  expected?: any;
}

export interface TestAssertion {
  type: string;
  description: string;
  validate: (actual: any) => boolean;
  expected?: any;
  message?: string;
}

export interface AssertionResult {
  passed: boolean;
  description: string;
  actual?: any;
  expected?: any;
  diff?: string;
  message?: string;
}

export interface TestFixture {
  name: string;
  type: string;
  data: any;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
}

export interface TestConfig {
  type: TestType;
  environment?: string;
  baseUrl?: string;
  apiUrl?: string;
  timeout?: number;
  retries?: number;
  parallel?: boolean;
  headless?: boolean;
  slowMo?: number;
  viewport?: { width: number; height: number };
  userAgent?: string;
  locale?: string;
  timezone?: string;
  permissions?: string[];
  geolocation?: { latitude: number; longitude: number };
  offline?: boolean;
  httpCredentials?: { username: string; password: string };
  ignoreHTTPSErrors?: boolean;
  proxy?: { server: string; bypass?: string };
  recordVideo?: boolean;
  recordHar?: boolean;
  screenshot?: 'on' | 'off' | 'only-on-failure';
  trace?: 'on' | 'off' | 'retain-on-failure';
}

export interface CoverageReport {
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
  files: FileCoverage[];
}

export interface CoverageMetric {
  total: number;
  covered: number;
  skipped: number;
  percentage: number;
}

export interface FileCoverage {
  path: string;
  statements: CoverageMetric;
  branches: CoverageMetric;
  functions: CoverageMetric;
  lines: CoverageMetric;
  uncoveredLines?: number[];
}

export interface PerformanceMetrics {
  responseTime: ResponseTimeMetrics;
  throughput: ThroughputMetrics;
  errorRate: number;
  cpu: ResourceMetrics;
  memory: ResourceMetrics;
  network: NetworkMetrics;
  custom?: Record<string, any>;
}

export interface ResponseTimeMetrics {
  min: number;
  max: number;
  mean: number;
  median: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export interface ThroughputMetrics {
  rps: number;
  rpm: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
}

export interface ResourceMetrics {
  min: number;
  max: number;
  mean: number;
  current: number;
  peak: number;
}

export interface NetworkMetrics {
  bytesIn: number;
  bytesOut: number;
  packetsIn: number;
  packetsOut: number;
  latency: number;
  packetLoss: number;
}

export interface ModelTestMetrics {
  accuracy: number;
  precision: number;
  recall: number;
  f1Score: number;
  latency: ResponseTimeMetrics;
  throughput: number;
  errorRate: number;
  driftScore?: number;
  biasScore?: number;
  fairnessScore?: number;
  robustnessScore?: number;
  explainabilityScore?: number;
}

export interface SecurityTestResult {
  vulnerabilities: SecurityVulnerability[];
  compliance: ComplianceResult[];
  penetrationTests: PenetrationTestResult[];
  dependencies: DependencyVulnerability[];
}

export interface SecurityVulnerability {
  id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  impact: string;
  remediation: string;
  cwe?: string;
  cvss?: number;
  references?: string[];
}

export interface ComplianceResult {
  standard: string;
  passed: boolean;
  requirements: ComplianceRequirement[];
}

export interface ComplianceRequirement {
  id: string;
  description: string;
  status: 'pass' | 'fail' | 'not_applicable';
  evidence?: string;
}

export interface PenetrationTestResult {
  test: string;
  target: string;
  successful: boolean;
  findings: string[];
  recommendations: string[];
}

export interface DependencyVulnerability {
  package: string;
  version: string;
  severity: string;
  vulnerabilities: string[];
  fixVersion?: string;
}

export interface LoadTestScenario {
  name: string;
  vus: number; // Virtual users
  duration: string;
  rampUp?: string;
  rampDown?: string;
  stages?: LoadTestStage[];
  thresholds?: LoadTestThreshold[];
}

export interface LoadTestStage {
  duration: string;
  target: number;
}

export interface LoadTestThreshold {
  metric: string;
  threshold: string;
  abortOnFail?: boolean;
}

export interface ChaosExperiment {
  name: string;
  description: string;
  target: string;
  fault: ChaosFault;
  duration: string;
  hypothesis: string;
  rollback?: () => Promise<void>;
}

export interface ChaosFault {
  type: 'network' | 'resource' | 'state' | 'time';
  action: string;
  parameters: Record<string, any>;
}

export interface ContractTest {
  consumer: string;
  provider: string;
  interactions: ContractInteraction[];
  metadata?: Record<string, any>;
}

export interface ContractInteraction {
  description: string;
  request: ContractRequest;
  response: ContractResponse;
  providerState?: string;
}

export interface ContractRequest {
  method: string;
  path: string;
  headers?: Record<string, string>;
  query?: Record<string, any>;
  body?: any;
}

export interface ContractResponse {
  status: number;
  headers?: Record<string, string>;
  body?: any;
}

export interface VisualTestResult {
  baseline: string;
  current: string;
  diff?: string;
  diffPercentage?: number;
  passed: boolean;
  threshold?: number;
}

export interface AccessibilityTestResult {
  violations: AccessibilityViolation[];
  passes: number;
  incomplete: AccessibilityIssue[];
  inapplicable: number;
}

export interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  help: string;
  helpUrl: string;
  nodes: AccessibilityNode[];
  tags: string[];
}

export interface AccessibilityIssue {
  id: string;
  description: string;
  nodes: AccessibilityNode[];
}

export interface AccessibilityNode {
  html: string;
  target: string[];
  failureSummary?: string;
}
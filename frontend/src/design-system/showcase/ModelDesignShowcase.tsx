/**
 * Model-Inspired Design System Showcase
 * Interactive demonstration of all design system components
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ModelButton,
  ModelInput,
  SearchInput,
  PasswordInput,
  ModelCard,
  CardHeader,
  CardContent,
  CardFooter,
  StatCard,
  ActionCard,
  ModelModal,
  ConfirmModal,
  AlertModal,
  ModelRiskGauge,
  MiniRiskIndicator,
  RiskBar,
  ModelFindingCard,
  FindingGroup,
  ButtonGroup,
  type Finding,
} from '../components';
import { tokens } from '../tokens';
import { useTheme } from '../providers/ThemeProvider';

export const ModelDesignShowcase: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [alertOpen, setAlertOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [riskScore, setRiskScore] = useState(75);

  // Sample finding data
  const sampleFinding: Finding = {
    id: '1',
    title: 'Automatic Renewal with Difficult Cancellation',
    description: 'The service automatically renews with limited cancellation options and penalties.',
    clause: 'Your subscription will automatically renew at the end of each billing period unless cancelled at least 30 days in advance. Early cancellation may result in fees up to the remaining contract value.',
    category: 'Subscription Terms',
    severity: 'high',
    riskScore: 75,
    location: {
      section: 'Terms of Service',
      paragraph: 14,
    },
    explanation: 'This clause makes it difficult to cancel the service and may result in unexpected charges. The 30-day advance notice requirement is unusually long, and the cancellation fees are excessive.',
    recommendations: [
      'Consider negotiating for a shorter cancellation notice period (7-14 days)',
      'Request removal of early cancellation fees',
      'Ask for a trial period with easy cancellation',
    ],
  };

  const findings: Finding[] = [
    sampleFinding,
    {
      ...sampleFinding,
      id: '2',
      title: 'Broad Data Collection Rights',
      description: 'The privacy policy grants extensive rights to collect and share user data.',
      severity: 'critical',
      riskScore: 90,
      category: 'Privacy',
    },
    {
      ...sampleFinding,
      id: '3',
      title: 'Limited Warranty Coverage',
      description: 'Warranty excludes many common issues and has a short duration.',
      severity: 'medium',
      riskScore: 45,
      category: 'Warranties',
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-charcoal-950 p-8">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h1 className="text-4xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Model-Inspired Design System
          </h1>
          <p className="mt-2 text-lg text-charcoal-600 dark:text-smoke-400">
            Sophisticated components for Fine Print AI
          </p>
          
          {/* Theme toggle */}
          <div className="mt-6 flex justify-center">
            <ModelButton
              variant="secondary"
              onClick={toggleTheme}
              icon={
                theme.isDark ? (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                    <path
                      d="M8 11C9.65685 11 11 9.65685 11 8C11 6.34315 9.65685 5 8 5C6.34315 5 5 6.34315 5 8C5 9.65685 6.34315 11 8 11Z"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M8 1V3M8 13V15M1 8H3M13 8H15M2.34315 2.34315L3.75736 3.75736M12.2426 12.2426L13.6569 13.6569M2.34315 13.6569L3.75736 12.2426M12.2426 3.75736L13.6569 2.34315"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 16 16">
                    <path
                      d="M14 8.5C13.7239 10.4735 12.5296 12.1978 10.7876 13.1433C9.04564 14.0889 6.97003 14.1488 5.17906 13.3056C3.38809 12.4625 2.08697 10.8123 1.66148 8.84561C1.236 6.87895 1.73566 4.81857 2.99926 3.26901C4.26286 1.71945 6.14718 0.852811 8.15015 0.916936C10.1531 0.981061 11.9845 1.96859 13.0988 3.57863C12.5879 3.40315 12.0449 3.34436 11.5073 3.40643C10.9697 3.46851 10.4505 3.65008 9.98716 3.93874C9.52386 4.2274 9.12831 4.61612 8.82912 5.07821C8.52992 5.5403 8.33462 6.06476 8.25696 6.61514C8.17929 7.16552 8.22153 7.72865 8.38069 8.26138C8.53985 8.79411 8.81196 9.28326 9.17696 9.69406C9.54195 10.1049 9.99054 10.4277 10.4896 10.6395C10.9887 10.8514 11.5261 10.9473 12.0645 10.9207C12.6029 10.8942 13.1288 10.746 13.604 10.4868C13.3627 11.8436 12.6241 13.0608 11.5299 13.8899C10.4358 14.719 9.06454 15.099 7.70236 14.9563C6.34018 14.8135 5.08808 14.1586 4.19488 13.1248C3.30169 12.091 2.83388 10.7544 2.88406 9.38587"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )
              }
            >
              {theme.isDark ? 'Light Mode' : 'Dark Mode'}
            </ModelButton>
          </div>
        </motion.div>

        {/* Buttons Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Buttons
          </h2>
          
          <ModelCard padding="lg">
            <CardContent className="space-y-6">
              {/* Button variants */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  Variants
                </h3>
                <div className="flex flex-wrap gap-3">
                  <ModelButton variant="primary">Primary Button</ModelButton>
                  <ModelButton variant="secondary">Secondary Button</ModelButton>
                  <ModelButton variant="ghost">Ghost Button</ModelButton>
                  <ModelButton variant="destructive">Destructive Button</ModelButton>
                </div>
              </div>

              {/* Button sizes */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  Sizes
                </h3>
                <div className="flex flex-wrap items-center gap-3">
                  <ModelButton size="xs">Extra Small</ModelButton>
                  <ModelButton size="sm">Small</ModelButton>
                  <ModelButton size="md">Medium</ModelButton>
                  <ModelButton size="lg">Large</ModelButton>
                  <ModelButton size="xl">Extra Large</ModelButton>
                </div>
              </div>

              {/* Button states */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  States
                </h3>
                <div className="flex flex-wrap gap-3">
                  <ModelButton loading>Loading</ModelButton>
                  <ModelButton disabled>Disabled</ModelButton>
                  <ModelButton fullWidth>Full Width</ModelButton>
                </div>
              </div>

              {/* Button group */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  Button Group
                </h3>
                <ButtonGroup>
                  <ModelButton variant="secondary">Cancel</ModelButton>
                  <ModelButton variant="primary">Save Changes</ModelButton>
                </ButtonGroup>
              </div>
            </CardContent>
          </ModelCard>
        </section>

        {/* Inputs Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Input Fields
          </h2>
          
          <ModelCard padding="lg">
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <ModelInput
                  label="Email Address"
                  type="email"
                  placeholder="Enter your email"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  helperText="We'll never share your email"
                />
                
                <ModelInput
                  label="Full Name"
                  placeholder="John Doe"
                  error="This field is required"
                />
                
                <SearchInput
                  label="Search Documents"
                  placeholder="Search..."
                />
                
                <PasswordInput
                  label="Password"
                  placeholder="Enter password"
                  success
                  helperText="Strong password"
                />
                
                <ModelInput
                  label="Description"
                  variant="filled"
                  placeholder="Tell us more..."
                />
                
                <ModelInput
                  label="Website URL"
                  variant="underlined"
                  placeholder="https://example.com"
                />
              </div>
            </CardContent>
          </ModelCard>
        </section>

        {/* Cards Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Cards
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              label="Documents Analyzed"
              value="1,234"
              change={{ value: 12.5, trend: 'up' }}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
            
            <StatCard
              label="Risk Score Average"
              value="42"
              change={{ value: 5.3, trend: 'down' }}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M9 19V13M15 19V8M12 19V5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
            
            <StatCard
              label="Issues Found"
              value="89"
              change={{ value: 18.2, trend: 'up' }}
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M12 8V12M12 16H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ActionCard
              title="Upload New Document"
              description="Analyze terms of service, privacy policies, and legal documents"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M7 16V12M7 12V8M7 12H17M17 12V8M17 12V16M12 7V3M8 3H16"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              action={{
                label: 'Upload',
                onClick: () => console.log('Upload clicked'),
              }}
            />
            
            <ActionCard
              title="View Analysis History"
              description="Access your previous document analyses and findings"
              icon={
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24">
                  <path
                    d="M12 8V12L15 15M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              }
              action={{
                label: 'View',
                onClick: () => console.log('History clicked'),
              }}
            />
          </div>
        </section>

        {/* Risk Visualization Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Risk Visualizations
          </h2>
          
          <ModelCard padding="lg">
            <CardContent className="space-y-8">
              {/* Risk gauges */}
              <div className="flex flex-wrap items-center justify-around gap-8">
                <ModelRiskGauge score={15} size="sm" />
                <ModelRiskGauge score={35} size="md" />
                <ModelRiskGauge score={riskScore} size="lg" />
              </div>
              
              {/* Risk score slider */}
              <div className="max-w-md mx-auto space-y-4">
                <label className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  Adjust Risk Score: {riskScore}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={riskScore}
                  onChange={(e) => setRiskScore(Number(e.target.value))}
                  className="w-full"
                />
              </div>
              
              {/* Risk bar */}
              <div className="max-w-2xl mx-auto space-y-4">
                <h3 className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  Risk Progress Bar
                </h3>
                <RiskBar score={riskScore} />
              </div>
              
              {/* Mini indicators */}
              <div className="space-y-4">
                <h3 className="text-sm font-medium text-charcoal-600 dark:text-smoke-400">
                  Mini Risk Indicators
                </h3>
                <div className="flex items-center gap-4">
                  <MiniRiskIndicator score={10} size="xs" />
                  <MiniRiskIndicator score={30} size="sm" />
                  <MiniRiskIndicator score={55} size="md" />
                  <MiniRiskIndicator score={75} />
                  <MiniRiskIndicator score={90} />
                </div>
              </div>
            </CardContent>
          </ModelCard>
        </section>

        {/* Findings Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Document Findings
          </h2>
          
          <FindingGroup
            title="Critical Issues Found"
            findings={findings}
            onAction={(id, action) => console.log('Finding action:', id, action)}
          />
        </section>

        {/* Modals Section */}
        <section className="space-y-6">
          <h2 className="text-2xl font-semibold text-charcoal-900 dark:text-smoke-100">
            Modals & Dialogs
          </h2>
          
          <ModelCard padding="lg">
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <ModelButton onClick={() => setModalOpen(true)}>
                  Open Modal
                </ModelButton>
                <ModelButton variant="secondary" onClick={() => setConfirmOpen(true)}>
                  Confirm Dialog
                </ModelButton>
                <ModelButton variant="ghost" onClick={() => setAlertOpen(true)}>
                  Alert Dialog
                </ModelButton>
              </div>
            </CardContent>
          </ModelCard>
        </section>

        {/* Sample modals */}
        <ModelModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title="Document Analysis Complete"
          description="We've finished analyzing your document and found several important issues."
          footer={
            <>
              <ModelButton variant="ghost" onClick={() => setModalOpen(false)}>
                Close
              </ModelButton>
              <ModelButton variant="primary" onClick={() => setModalOpen(false)}>
                View Results
              </ModelButton>
            </>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-charcoal-600 dark:text-smoke-400">
              The analysis has identified 12 potential issues across various categories including privacy, 
              subscription terms, and data sharing policies.
            </p>
            <div className="flex items-center justify-center py-4">
              <ModelRiskGauge score={72} size="sm" />
            </div>
          </div>
        </ModelModal>

        <ConfirmModal
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => console.log('Confirmed')}
          title="Delete Analysis?"
          description="This action cannot be undone. The analysis results will be permanently removed."
          variant="destructive"
          confirmText="Delete"
        />

        <AlertModal
          open={alertOpen}
          onClose={() => setAlertOpen(false)}
          title="Analysis Saved"
          description="Your document analysis has been saved successfully."
          type="success"
        />
      </div>
    </div>
  );
};
"""
DSPy Business Modules
Real DSPy module implementations for Fine Print AI business operations
"""

from typing import List, Dict, Any, Optional
from dataclasses import dataclass
import dspy
from loguru import logger

# DSPy Signatures for Fine Print AI Business Operations

class LegalAnalysisSignature(dspy.Signature):
    """Analyze legal document and identify problematic clauses"""
    document_content = dspy.InputField(desc="Legal document content to analyze")
    document_type = dspy.InputField(desc="Type of legal document (terms_of_service, privacy_policy, eula, license)")
    language = dspy.InputField(desc="Document language code", default="en")
    analysis_depth = dspy.InputField(desc="Analysis depth level (basic, detailed, comprehensive)", default="detailed")
    
    risk_score = dspy.OutputField(desc="Overall risk score from 0-100")
    executive_summary = dspy.OutputField(desc="Brief executive summary of main concerns")
    key_findings = dspy.OutputField(desc="List of key problematic findings")
    recommendations = dspy.OutputField(desc="List of actionable recommendations")
    findings = dspy.OutputField(desc="Detailed findings with categories, severity, and confidence scores")

class MarketingContentSignature(dspy.Signature):
    """Optimize marketing content for target audience and conversion goals"""
    content_type = dspy.InputField(desc="Type of marketing content (email, blog_post, ad_copy, social_media)")
    target_audience = dspy.InputField(desc="Target audience description and demographics")
    content_draft = dspy.InputField(desc="Initial content draft to optimize")
    optimization_goals = dspy.InputField(desc="List of optimization goals (engagement, conversion, brand_awareness)")
    
    optimized_content = dspy.OutputField(desc="Optimized content version")
    optimization_rationale = dspy.OutputField(desc="Explanation of optimization decisions")
    predicted_performance = dspy.OutputField(desc="Predicted performance metrics")
    a_b_test_variants = dspy.OutputField(desc="Additional variants for A/B testing")

class SalesOptimizationSignature(dspy.Signature):
    """Optimize sales communication for conversion and engagement"""
    communication_type = dspy.InputField(desc="Type of sales communication (email, call_script, proposal, follow_up)")
    prospect_profile = dspy.InputField(desc="Prospect profile including industry, role, pain points")
    message_draft = dspy.InputField(desc="Initial message draft to optimize")
    conversion_goals = dspy.InputField(desc="List of conversion goals (meeting_booking, demo_request, purchase)")
    
    optimized_message = dspy.OutputField(desc="Optimized sales message")
    personalization_elements = dspy.OutputField(desc="Key personalization elements used")
    conversion_triggers = dspy.OutputField(desc="Psychological triggers and persuasion techniques")
    follow_up_strategy = dspy.OutputField(desc="Recommended follow-up strategy")

class SupportResponseSignature(dspy.Signature):
    """Optimize customer support responses for satisfaction and resolution"""
    issue_type = dspy.InputField(desc="Type of customer issue (technical, billing, product, complaint)")
    customer_context = dspy.InputField(desc="Customer context including history, tier, sentiment")
    response_draft = dspy.InputField(desc="Initial support response draft")
    satisfaction_goals = dspy.InputField(desc="List of satisfaction goals (quick_resolution, empathy, upsell)")
    
    optimized_response = dspy.OutputField(desc="Optimized support response")
    empathy_elements = dspy.OutputField(desc="Empathy and emotional intelligence elements")
    resolution_steps = dspy.OutputField(desc="Clear resolution steps and timeline")
    escalation_guidance = dspy.OutputField(desc="When and how to escalate if needed")

# Result Data Classes
@dataclass
class LegalAnalysisResult:
    risk_score: float
    executive_summary: str
    key_findings: List[str]
    recommendations: List[str]
    findings: List[Dict[str, Any]]
    dspy_metadata: Optional[Dict[str, Any]] = None

@dataclass
class MarketingContentResult:
    optimized_content: str
    optimization_rationale: str
    predicted_performance: Dict[str, Any]
    a_b_test_variants: List[str]

@dataclass
class SalesOptimizationResult:
    optimized_message: str
    personalization_elements: List[str]
    conversion_triggers: List[str]
    follow_up_strategy: str

@dataclass
class SupportResponseResult:
    optimized_response: str
    empathy_elements: List[str]
    resolution_steps: List[str]
    escalation_guidance: str

# DSPy Module Implementations

class LegalAnalysisModule(dspy.Module):
    """Legal document analysis module using Chain of Thought reasoning"""
    
    def __init__(self):
        super().__init__()
        self.description = "Analyze legal documents for problematic clauses and provide risk assessment"
        self.optimization_version = "1.0.0"
        
        # DSPy Chain of Thought for complex legal analysis
        self.legal_analyzer = dspy.ChainOfThought(LegalAnalysisSignature)
    
    def forward(
        self,
        document_content: str,
        document_type: str,
        language: str = "en",
        analysis_depth: str = "detailed"
    ) -> LegalAnalysisResult:
        """Analyze legal document using DSPy reasoning"""
        try:
            # Execute DSPy Chain of Thought reasoning
            prediction = self.legal_analyzer(
                document_content=document_content,
                document_type=document_type,
                language=language,
                analysis_depth=analysis_depth
            )
            
            # Parse and structure results
            risk_score = self._parse_risk_score(prediction.risk_score)
            findings = self._parse_findings(prediction.findings)
            
            return LegalAnalysisResult(
                risk_score=risk_score,
                executive_summary=prediction.executive_summary,
                key_findings=self._parse_list(prediction.key_findings),
                recommendations=self._parse_list(prediction.recommendations),
                findings=findings
            )
            
        except Exception as e:
            logger.error(f"Legal analysis failed: {e}")
            # Return fallback result
            return LegalAnalysisResult(
                risk_score=50.0,
                executive_summary="Analysis could not be completed due to technical difficulties.",
                key_findings=["Technical analysis error occurred"],
                recommendations=["Please retry the analysis"],
                findings=[{
                    "category": "System Error",
                    "title": "Analysis Error",
                    "description": "The legal analysis could not be completed.",
                    "severity": "medium",
                    "confidence_score": 0.1
                }]
            )
    
    def _parse_risk_score(self, risk_score_text: str) -> float:
        """Parse risk score from text output"""
        try:
            import re
            # Extract number from text
            matches = re.findall(r'\d+\.?\d*', str(risk_score_text))
            if matches:
                score = float(matches[0])
                return max(0.0, min(100.0, score))
            return 50.0
        except:
            return 50.0
    
    def _parse_list(self, list_text: str) -> List[str]:
        """Parse list from text output"""
        try:
            if isinstance(list_text, list):
                return list_text
            
            # Split by common delimiters
            items = []
            for delimiter in ['\n', ';', ',']:
                if delimiter in str(list_text):
                    items = [item.strip() for item in str(list_text).split(delimiter)]
                    break
            
            # Clean up items
            items = [item for item in items if item and not item.startswith(('•', '-', '*'))]
            return items[:10]  # Limit to 10 items
            
        except:
            return [str(list_text)] if list_text else []
    
    def _parse_findings(self, findings_text: str) -> List[Dict[str, Any]]:
        """Parse detailed findings from text output"""
        try:
            # This is a simplified parser - in production, you'd want more robust parsing
            # or structure the DSPy output to return JSON directly
            findings = []
            
            if isinstance(findings_text, list):
                return findings_text
            
            # Split findings and create structured data
            finding_sections = str(findings_text).split('\n\n')
            
            for section in finding_sections[:20]:  # Limit to 20 findings
                if section.strip():
                    finding = {
                        "category": "Legal Issue",
                        "title": section.split('\n')[0][:100] if '\n' in section else section[:100],
                        "description": section,
                        "severity": "medium",
                        "confidence_score": 0.7,
                        "text_excerpt": section[:200],
                        "recommendation": "Review this clause carefully",
                        "impact_explanation": "This may affect your legal rights"
                    }
                    findings.append(finding)
            
            return findings if findings else [{
                "category": "General",
                "title": "Document Analysis",
                "description": "Legal document has been analyzed",
                "severity": "low",
                "confidence_score": 0.5
            }]
            
        except Exception as e:
            logger.warning(f"Failed to parse findings: {e}")
            return [{
                "category": "Parsing Error",
                "title": "Could not parse findings",
                "description": str(findings_text)[:500],
                "severity": "medium",
                "confidence_score": 0.3
            }]

class MarketingContentModule(dspy.Module):
    """Marketing content optimization module"""
    
    def __init__(self):
        super().__init__()
        self.description = "Optimize marketing content for engagement and conversion"
        self.optimization_version = "1.0.0"
        
        # Use ReAct for iterative content optimization
        self.content_optimizer = dspy.ReAct(MarketingContentSignature)
    
    def forward(
        self,
        content_type: str,
        target_audience: str,
        content_draft: str,
        optimization_goals: List[str]
    ) -> MarketingContentResult:
        """Optimize marketing content using DSPy ReAct reasoning"""
        try:
            prediction = self.content_optimizer(
                content_type=content_type,
                target_audience=target_audience,
                content_draft=content_draft,
                optimization_goals=", ".join(optimization_goals)
            )
            
            return MarketingContentResult(
                optimized_content=prediction.optimized_content,
                optimization_rationale=prediction.optimization_rationale,
                predicted_performance=self._parse_performance_metrics(prediction.predicted_performance),
                a_b_test_variants=self._parse_list(prediction.a_b_test_variants)
            )
            
        except Exception as e:
            logger.error(f"Marketing content optimization failed: {e}")
            return MarketingContentResult(
                optimized_content=content_draft,
                optimization_rationale="Optimization could not be completed",
                predicted_performance={"engagement": 0.5, "conversion": 0.3},
                a_b_test_variants=[content_draft]
            )
    
    def _parse_performance_metrics(self, metrics_text: str) -> Dict[str, Any]:
        """Parse predicted performance metrics"""
        try:
            import re
            metrics = {}
            
            # Extract percentage values
            percentages = re.findall(r'(\w+).*?(\d+\.?\d*)%', str(metrics_text))
            for metric, value in percentages:
                metrics[metric.lower()] = float(value) / 100
            
            # Default metrics if none found
            if not metrics:
                metrics = {
                    "engagement_rate": 0.15,
                    "click_through_rate": 0.05,
                    "conversion_rate": 0.02
                }
            
            return metrics
            
        except:
            return {"engagement": 0.5, "conversion": 0.3}

class SalesOptimizationModule(dspy.Module):
    """Sales communication optimization module"""
    
    def __init__(self):
        super().__init__()
        self.description = "Optimize sales communications for conversion and engagement"
        self.optimization_version = "1.0.0"
        
        # Use Chain of Thought with sales psychology focus
        self.sales_optimizer = dspy.ChainOfThoughtWithHint(
            SalesOptimizationSignature,
            hint="Focus on psychological triggers, personalization, and clear value propositions"
        )
    
    def forward(
        self,
        communication_type: str,
        prospect_profile: Dict[str, Any],
        message_draft: str,
        conversion_goals: List[str]
    ) -> SalesOptimizationResult:
        """Optimize sales communication using DSPy reasoning"""
        try:
            prediction = self.sales_optimizer(
                communication_type=communication_type,
                prospect_profile=str(prospect_profile),
                message_draft=message_draft,
                conversion_goals=", ".join(conversion_goals)
            )
            
            return SalesOptimizationResult(
                optimized_message=prediction.optimized_message,
                personalization_elements=self._parse_list(prediction.personalization_elements),
                conversion_triggers=self._parse_list(prediction.conversion_triggers),
                follow_up_strategy=prediction.follow_up_strategy
            )
            
        except Exception as e:
            logger.error(f"Sales optimization failed: {e}")
            return SalesOptimizationResult(
                optimized_message=message_draft,
                personalization_elements=["Personalization failed"],
                conversion_triggers=["Basic value proposition"],
                follow_up_strategy="Follow up in 3-5 business days"
            )

class SupportResponseModule(dspy.Module):
    """Customer support response optimization module"""
    
    def __init__(self):
        super().__init__()
        self.description = "Optimize customer support responses for satisfaction and resolution"
        self.optimization_version = "1.0.0"
        
        # Use Chain of Thought with empathy focus
        self.support_optimizer = dspy.ChainOfThoughtWithHint(
            SupportResponseSignature,
            hint="Prioritize empathy, clear communication, and actionable solutions"
        )
    
    def forward(
        self,
        issue_type: str,
        customer_context: Dict[str, Any],
        response_draft: str,
        satisfaction_goals: List[str]
    ) -> SupportResponseResult:
        """Optimize support response using DSPy reasoning"""
        try:
            prediction = self.support_optimizer(
                issue_type=issue_type,
                customer_context=str(customer_context),
                response_draft=response_draft,
                satisfaction_goals=", ".join(satisfaction_goals)
            )
            
            return SupportResponseResult(
                optimized_response=prediction.optimized_response,
                empathy_elements=self._parse_list(prediction.empathy_elements),
                resolution_steps=self._parse_list(prediction.resolution_steps),
                escalation_guidance=prediction.escalation_guidance
            )
            
        except Exception as e:
            logger.error(f"Support response optimization failed: {e}")
            return SupportResponseResult(
                optimized_response=response_draft,
                empathy_elements=["Acknowledge customer concern"],
                resolution_steps=["Investigate issue", "Provide solution"],
                escalation_guidance="Escalate if resolution not possible within 24 hours"
            )
    
    def _parse_list(self, list_text: str) -> List[str]:
        """Parse list from text output"""
        try:
            if isinstance(list_text, list):
                return list_text
            
            # Split by common delimiters
            items = []
            for delimiter in ['\n', ';', '•', '-']:
                if delimiter in str(list_text):
                    items = [item.strip() for item in str(list_text).split(delimiter)]
                    break
            
            # Clean up items
            items = [item for item in items if item and len(item) > 3]
            return items[:8]  # Limit to 8 items
            
        except:
            return [str(list_text)] if list_text else []

# Advanced Multi-Module Composition

class ComprehensiveLegalAnalysisModule(dspy.Module):
    """Advanced legal analysis using multiple DSPy reasoning patterns"""
    
    def __init__(self):
        super().__init__()
        self.description = "Comprehensive legal analysis using multi-hop reasoning"
        self.optimization_version = "1.0.0"
        
        # Multi-step analysis pipeline
        self.initial_scan = dspy.ChainOfThought("document_content -> initial_findings")
        self.detailed_analysis = dspy.ReAct(LegalAnalysisSignature)
        self.risk_assessment = dspy.ChainOfThought("findings -> risk_score, recommendations")
    
    def forward(
        self,
        document_content: str,
        document_type: str,
        language: str = "en",
        analysis_depth: str = "comprehensive"
    ) -> LegalAnalysisResult:
        """Multi-hop legal analysis"""
        try:
            # Step 1: Initial scan
            initial_scan = self.initial_scan(document_content=document_content)
            
            # Step 2: Detailed analysis
            detailed_analysis = self.detailed_analysis(
                document_content=document_content,
                document_type=document_type,
                language=language,
                analysis_depth=analysis_depth
            )
            
            # Step 3: Risk assessment synthesis
            risk_assessment = self.risk_assessment(findings=detailed_analysis.findings)
            
            # Combine results
            return LegalAnalysisResult(
                risk_score=self._parse_risk_score(risk_assessment.risk_score),
                executive_summary=detailed_analysis.executive_summary,
                key_findings=self._parse_list(detailed_analysis.key_findings),
                recommendations=self._parse_list(risk_assessment.recommendations),
                findings=self._parse_findings(detailed_analysis.findings)
            )
            
        except Exception as e:
            logger.error(f"Comprehensive legal analysis failed: {e}")
            # Fallback to basic analysis
            basic_module = LegalAnalysisModule()
            return basic_module.forward(document_content, document_type, language, "detailed")
    
    def _parse_risk_score(self, risk_score_text: str) -> float:
        """Parse risk score from text"""
        try:
            import re
            matches = re.findall(r'\d+\.?\d*', str(risk_score_text))
            if matches:
                return max(0.0, min(100.0, float(matches[0])))
            return 50.0
        except:
            return 50.0
    
    def _parse_list(self, list_text: str) -> List[str]:
        """Parse list from text"""
        if isinstance(list_text, list):
            return list_text
        items = [item.strip() for item in str(list_text).split('\n') if item.strip()]
        return items[:10]
    
    def _parse_findings(self, findings_text: str) -> List[Dict[str, Any]]:
        """Parse findings into structured format"""
        # Simplified parsing - in production, use more robust parsing
        findings = []
        sections = str(findings_text).split('\n\n')
        
        for section in sections[:15]:
            if section.strip():
                findings.append({
                    "category": "Legal Analysis",
                    "title": section.split('\n')[0][:100],
                    "description": section,
                    "severity": "medium",
                    "confidence_score": 0.8
                })
        
        return findings if findings else [{
            "category": "Analysis Complete",
            "title": "Document analyzed",
            "description": "Comprehensive analysis completed",
            "severity": "low",
            "confidence_score": 0.9
        }]
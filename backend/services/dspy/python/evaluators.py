"""
DSPy Business Evaluators
Custom evaluation metrics for business-specific optimization
"""

import re
from typing import Any, Dict, List, Optional
from abc import ABC, abstractmethod
import dspy
from loguru import logger

class BaseBusinessEvaluator(ABC):
    """Base class for business-specific evaluators"""
    
    def __init__(self, weight: float = 1.0):
        self.weight = weight
    
    @abstractmethod
    def evaluate(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate prediction against example"""
        pass
    
    def __call__(self, example: dspy.Example, prediction: Any) -> float:
        """Make evaluator callable for DSPy compatibility"""
        return self.evaluate(example, prediction)

class AccuracyEvaluator(BaseBusinessEvaluator):
    """General accuracy evaluator for DSPy optimization"""
    
    def evaluate(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate prediction accuracy"""
        try:
            if not hasattr(example, 'expected_output') or not prediction:
                return 0.0
            
            expected = example.expected_output
            
            # Risk score accuracy (within 10% is considered accurate)
            risk_score_accuracy = 0.0
            if hasattr(prediction, 'risk_score') and 'risk_score' in expected:
                expected_risk = float(expected['risk_score'])
                predicted_risk = float(getattr(prediction, 'risk_score', 0))
                risk_diff = abs(expected_risk - predicted_risk)
                risk_score_accuracy = max(0, 1 - (risk_diff / 100)) # Normalize to 0-1
            
            # Key findings overlap
            findings_accuracy = 0.0
            if hasattr(prediction, 'key_findings') and 'key_findings' in expected:
                expected_findings = set(expected['key_findings'])
                predicted_findings = set(getattr(prediction, 'key_findings', []))
                
                if expected_findings:
                    overlap = len(expected_findings.intersection(predicted_findings))
                    findings_accuracy = overlap / len(expected_findings)
            
            # Category accuracy for detailed findings
            category_accuracy = 0.0
            if hasattr(prediction, 'findings') and 'findings' in expected:
                expected_categories = set()
                predicted_categories = set()
                
                for finding in expected.get('findings', []):
                    if 'category' in finding:
                        expected_categories.add(finding['category'])
                
                for finding in getattr(prediction, 'findings', []):
                    if isinstance(finding, dict) and 'category' in finding:
                        predicted_categories.add(finding['category'])
                
                if expected_categories:
                    overlap = len(expected_categories.intersection(predicted_categories))
                    category_accuracy = overlap / len(expected_categories)
            
            # Weighted overall accuracy
            overall_accuracy = (
                risk_score_accuracy * 0.4 +
                findings_accuracy * 0.4 +
                category_accuracy * 0.2
            )
            
            return min(1.0, max(0.0, overall_accuracy))
            
        except Exception as e:
            logger.error(f"Accuracy evaluation failed: {e}")
            return 0.0

class BusinessMetricEvaluator(BaseBusinessEvaluator):
    """Evaluator for business-specific metrics"""
    
    def __init__(self, metric_type: str = "legal_accuracy", weight: float = 1.0):
        super().__init__(weight)
        self.metric_type = metric_type
    
    def evaluate(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate based on business metric type"""
        try:
            if self.metric_type == "legal_accuracy":
                return self._evaluate_legal_accuracy(example, prediction)
            elif self.metric_type == "marketing_effectiveness":
                return self._evaluate_marketing_effectiveness(example, prediction)
            elif self.metric_type == "sales_conversion":
                return self._evaluate_sales_conversion(example, prediction)
            elif self.metric_type == "support_satisfaction":
                return self._evaluate_support_satisfaction(example, prediction)
            else:
                return self._evaluate_general_quality(example, prediction)
                
        except Exception as e:
            logger.error(f"Business metric evaluation failed: {e}")
            return 0.0
    
    def _evaluate_legal_accuracy(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate legal analysis accuracy"""
        score = 0.0
        
        # Risk score alignment
        if hasattr(example, 'expected_output') and hasattr(prediction, 'risk_score'):
            expected_risk = example.expected_output.get('risk_score', 50)
            predicted_risk = getattr(prediction, 'risk_score', 50)
            risk_accuracy = 1 - (abs(expected_risk - predicted_risk) / 100)
            score += risk_accuracy * 0.3
        
        # Critical findings detection
        if hasattr(prediction, 'findings'):
            critical_findings = sum(
                1 for finding in getattr(prediction, 'findings', [])
                if isinstance(finding, dict) and finding.get('severity') == 'critical'
            )
            # Reward finding critical issues (up to 5)
            score += min(critical_findings / 5, 1) * 0.3
        
        # Recommendation quality (length and specificity as proxy)
        if hasattr(prediction, 'recommendations'):
            recommendations = getattr(prediction, 'recommendations', [])
            if recommendations:
                avg_length = sum(len(rec) for rec in recommendations) / len(recommendations)
                # Reward detailed recommendations (50-200 chars optimal)
                length_score = min(avg_length / 200, 1) if avg_length >= 50 else avg_length / 50
                score += length_score * 0.2
        
        # Executive summary quality
        if hasattr(prediction, 'executive_summary'):
            summary = getattr(prediction, 'executive_summary', '')
            # Reward summaries between 100-500 characters
            if 100 <= len(summary) <= 500:
                score += 0.2
            elif len(summary) > 50:
                score += 0.1
        
        return min(1.0, score)
    
    def _evaluate_marketing_effectiveness(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate marketing content effectiveness"""
        score = 0.0
        
        # Content optimization quality
        if hasattr(prediction, 'optimized_content'):
            content = getattr(prediction, 'optimized_content', '')
            # Reward engaging content (presence of action words, emotional triggers)
            action_words = ['discover', 'unlock', 'transform', 'achieve', 'exclusive', 'limited']
            action_score = sum(1 for word in action_words if word.lower() in content.lower())
            score += min(action_score / 3, 1) * 0.3
        
        # A/B test variants quality
        if hasattr(prediction, 'a_b_test_variants'):
            variants = getattr(prediction, 'a_b_test_variants', [])
            # Reward having multiple diverse variants
            score += min(len(variants) / 3, 1) * 0.2
        
        # Predicted performance realism
        if hasattr(prediction, 'predicted_performance'):
            performance = getattr(prediction, 'predicted_performance', {})
            if isinstance(performance, dict):
                # Reward realistic performance predictions (0.01-0.15 for conversion rates)
                conversion_rate = performance.get('conversion_rate', 0)
                if 0.01 <= conversion_rate <= 0.15:
                    score += 0.3
                elif 0.005 <= conversion_rate <= 0.30:
                    score += 0.2
        
        # Optimization rationale quality
        if hasattr(prediction, 'optimization_rationale'):
            rationale = getattr(prediction, 'optimization_rationale', '')
            # Reward detailed rationale
            if len(rationale) >= 100:
                score += 0.2
        
        return min(1.0, score)
    
    def _evaluate_sales_conversion(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate sales communication conversion potential"""
        score = 0.0
        
        # Personalization elements
        if hasattr(prediction, 'personalization_elements'):
            elements = getattr(prediction, 'personalization_elements', [])
            # Reward having 2-5 personalization elements
            score += min(len(elements) / 4, 1) * 0.3
        
        # Conversion triggers
        if hasattr(prediction, 'conversion_triggers'):
            triggers = getattr(prediction, 'conversion_triggers', [])
            # Reward psychological triggers
            score += min(len(triggers) / 3, 1) * 0.3
        
        # Message optimization
        if hasattr(prediction, 'optimized_message'):
            message = getattr(prediction, 'optimized_message', '')
            # Reward clear call-to-action
            cta_phrases = ['schedule', 'book', 'call', 'demo', 'meeting', 'discuss']
            has_cta = any(phrase in message.lower() for phrase in cta_phrases)
            if has_cta:
                score += 0.25
        
        # Follow-up strategy
        if hasattr(prediction, 'follow_up_strategy'):
            strategy = getattr(prediction, 'follow_up_strategy', '')
            # Reward specific follow-up plans
            if len(strategy) >= 50 and any(word in strategy.lower() for word in ['day', 'week', 'timeline']):
                score += 0.15
        
        return min(1.0, score)
    
    def _evaluate_support_satisfaction(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate customer support satisfaction potential"""
        score = 0.0
        
        # Empathy elements
        if hasattr(prediction, 'empathy_elements'):
            elements = getattr(prediction, 'empathy_elements', [])
            # Reward empathetic language
            score += min(len(elements) / 3, 1) * 0.3
        
        # Resolution steps clarity
        if hasattr(prediction, 'resolution_steps'):
            steps = getattr(prediction, 'resolution_steps', [])
            # Reward clear, actionable steps
            score += min(len(steps) / 4, 1) * 0.3
        
        # Response optimization
        if hasattr(prediction, 'optimized_response'):
            response = getattr(prediction, 'optimized_response', '')
            # Reward professional yet empathetic tone
            empathy_words = ['understand', 'apologize', 'sorry', 'help', 'assist', 'resolve']
            empathy_score = sum(1 for word in empathy_words if word.lower() in response.lower())
            score += min(empathy_score / 3, 1) * 0.25
        
        # Escalation guidance
        if hasattr(prediction, 'escalation_guidance'):
            guidance = getattr(prediction, 'escalation_guidance', '')
            # Reward clear escalation criteria
            if len(guidance) >= 30:
                score += 0.15
        
        return min(1.0, score)
    
    def _evaluate_general_quality(self, example: dspy.Example, prediction: Any) -> float:
        """General quality evaluation"""
        # Basic quality checks
        if not prediction:
            return 0.0
        
        # Check if prediction has expected attributes
        score = 0.5  # Base score for having a prediction
        
        # Reward completeness
        expected_attrs = ['risk_score', 'executive_summary', 'key_findings', 'recommendations']
        present_attrs = sum(1 for attr in expected_attrs if hasattr(prediction, attr))
        score += (present_attrs / len(expected_attrs)) * 0.5
        
        return min(1.0, score)

class ConversionRateEvaluator(BaseBusinessEvaluator):
    """Evaluator focused on conversion rate optimization"""
    
    def evaluate(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate conversion potential"""
        try:
            score = 0.0
            
            # Check for conversion-focused elements
            if hasattr(prediction, 'optimized_content') or hasattr(prediction, 'optimized_message'):
                content = getattr(prediction, 'optimized_content', '') or getattr(prediction, 'optimized_message', '')
                
                # Look for urgency indicators
                urgency_words = ['limited', 'today', 'now', 'urgent', 'deadline', 'expires']
                urgency_score = sum(1 for word in urgency_words if word.lower() in content.lower())
                score += min(urgency_score / 2, 1) * 0.3
                
                # Look for value propositions
                value_words = ['save', 'benefit', 'advantage', 'value', 'roi', 'return']
                value_score = sum(1 for word in value_words if word.lower() in content.lower())
                score += min(value_score / 2, 1) * 0.3
                
                # Look for clear call-to-action
                cta_patterns = [
                    r'click\s+here', r'sign\s+up', r'get\s+started', r'learn\s+more',
                    r'contact\s+us', r'schedule', r'book\s+now', r'try\s+free'
                ]
                cta_score = sum(1 for pattern in cta_patterns if re.search(pattern, content, re.IGNORECASE))
                score += min(cta_score / 2, 1) * 0.4
            
            return min(1.0, score)
            
        except Exception as e:
            logger.error(f"Conversion rate evaluation failed: {e}")
            return 0.0

class SatisfactionScoreEvaluator(BaseBusinessEvaluator):
    """Evaluator for customer satisfaction metrics"""
    
    def evaluate(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate satisfaction potential"""
        try:
            score = 0.0
            
            # Check for empathy and understanding
            if hasattr(prediction, 'optimized_response'):
                response = getattr(prediction, 'optimized_response', '')
                
                # Empathy indicators
                empathy_phrases = [
                    'i understand', 'i apologize', 'i\'m sorry', 'thank you for',
                    'i appreciate', 'let me help', 'i\'ll assist'
                ]
                empathy_score = sum(1 for phrase in empathy_phrases if phrase in response.lower())
                score += min(empathy_score / 3, 1) * 0.4
                
                # Solution-oriented language
                solution_words = ['resolve', 'fix', 'solution', 'help', 'assist', 'support']
                solution_score = sum(1 for word in solution_words if word.lower() in response.lower())
                score += min(solution_score / 3, 1) * 0.3
                
                # Professional tone (avoiding negative words)
                negative_words = ['unfortunately', 'cannot', 'unable', 'impossible', 'won\'t']
                negative_score = sum(1 for word in negative_words if word.lower() in response.lower())
                score += max(0, 1 - negative_score / 2) * 0.3
            
            return min(1.0, score)
            
        except Exception as e:
            logger.error(f"Satisfaction score evaluation failed: {e}")
            return 0.0

class CompositeBusinessEvaluator(BaseBusinessEvaluator):
    """Composite evaluator combining multiple business metrics"""
    
    def __init__(self, evaluators: List[BaseBusinessEvaluator], weights: Optional[List[float]] = None):
        super().__init__()
        self.evaluators = evaluators
        self.weights = weights or [1.0] * len(evaluators)
        
        # Normalize weights
        total_weight = sum(self.weights)
        if total_weight > 0:
            self.weights = [w / total_weight for w in self.weights]
    
    def evaluate(self, example: dspy.Example, prediction: Any) -> float:
        """Evaluate using composite scoring"""
        try:
            scores = []
            for evaluator, weight in zip(self.evaluators, self.weights):
                score = evaluator.evaluate(example, prediction)
                scores.append(score * weight)
            
            return sum(scores)
            
        except Exception as e:
            logger.error(f"Composite evaluation failed: {e}")
            return 0.0

# Factory function for creating evaluators
def create_evaluator(evaluator_type: str, **kwargs) -> BaseBusinessEvaluator:
    """Factory function to create appropriate evaluator"""
    
    evaluator_map = {
        "accuracy": AccuracyEvaluator,
        "business_metric": BusinessMetricEvaluator,
        "conversion_rate": ConversionRateEvaluator,
        "satisfaction_score": SatisfactionScoreEvaluator
    }
    
    if evaluator_type in evaluator_map:
        return evaluator_map[evaluator_type](**kwargs)
    else:
        logger.warning(f"Unknown evaluator type: {evaluator_type}, using default accuracy evaluator")
        return AccuracyEvaluator(**kwargs)

# Specialized evaluators for specific business domains
class LegalAccuracyEvaluator(BusinessMetricEvaluator):
    """Specialized evaluator for legal document analysis"""
    
    def __init__(self):
        super().__init__(metric_type="legal_accuracy", weight=1.0)

class MarketingEffectivenessEvaluator(BusinessMetricEvaluator):
    """Specialized evaluator for marketing content"""
    
    def __init__(self):
        super().__init__(metric_type="marketing_effectiveness", weight=1.0)

class SalesConversionEvaluator(BusinessMetricEvaluator):
    """Specialized evaluator for sales optimization"""
    
    def __init__(self):
        super().__init__(metric_type="sales_conversion", weight=1.0)

class SupportSatisfactionEvaluator(BusinessMetricEvaluator):
    """Specialized evaluator for support responses"""
    
    def __init__(self):
        super().__init__(metric_type="support_satisfaction", weight=1.0)
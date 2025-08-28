"""
Prompt Template Manager
Manage and version optimized prompt templates from DSPy optimization
"""

import json
import asyncio
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import uuid
from pathlib import Path
from loguru import logger

@dataclass
class PromptTemplate:
    """Optimized prompt template from DSPy"""
    id: str
    name: str
    category: str
    module_name: str
    version: str
    description: str
    template_content: str
    optimization_results: Dict[str, Any]
    performance_metrics: Dict[str, float]
    created_at: str
    updated_at: str
    is_active: bool = True
    metadata: Optional[Dict[str, Any]] = None

@dataclass
class TemplateVersion:
    """Version history for prompt templates"""
    template_id: str
    version: str
    changes: str
    performance_before: float
    performance_after: float
    created_at: str
    created_by: str

class PromptTemplateManager:
    """Manages optimized prompt templates and their versions"""
    
    def __init__(self, storage_path: str = "./templates"):
        self.storage_path = Path(storage_path)
        self.storage_path.mkdir(exist_ok=True)
        
        self.templates: Dict[str, PromptTemplate] = {}
        self.template_versions: Dict[str, List[TemplateVersion]] = {}
        
        # Load existing templates
        asyncio.create_task(self._load_templates())
        
        logger.info(f"Prompt Template Manager initialized with storage at {self.storage_path}")
    
    async def _load_templates(self):
        """Load templates from storage"""
        try:
            templates_file = self.storage_path / "templates.json"
            if templates_file.exists():
                with open(templates_file, 'r') as f:
                    data = json.load(f)
                    
                for template_data in data.get('templates', []):
                    template = PromptTemplate(**template_data)
                    self.templates[template.id] = template
                
                for version_data in data.get('versions', []):
                    version = TemplateVersion(**version_data)
                    if version.template_id not in self.template_versions:
                        self.template_versions[version.template_id] = []
                    self.template_versions[version.template_id].append(version)
            
            logger.info(f"Loaded {len(self.templates)} templates from storage")
            
        except Exception as e:
            logger.error(f"Failed to load templates: {e}")
    
    async def _save_templates(self):
        """Save templates to storage"""
        try:
            templates_file = self.storage_path / "templates.json"
            
            data = {
                "templates": [asdict(template) for template in self.templates.values()],
                "versions": [
                    asdict(version) 
                    for versions in self.template_versions.values() 
                    for version in versions
                ],
                "saved_at": datetime.utcnow().isoformat()
            }
            
            with open(templates_file, 'w') as f:
                json.dump(data, f, indent=2)
            
            logger.debug("Templates saved to storage")
            
        except Exception as e:
            logger.error(f"Failed to save templates: {e}")
    
    async def save_optimized_module(
        self,
        module_name: str,
        compiled_module: Any,
        optimization_results: Any
    ) -> str:
        """Save optimized DSPy module as a template"""
        try:
            template_id = str(uuid.uuid4())
            
            # Extract template content from compiled module
            template_content = self._extract_template_content(compiled_module)
            
            # Create template
            template = PromptTemplate(
                id=template_id,
                name=f"{module_name}_optimized",
                category=self._get_module_category(module_name),
                module_name=module_name,
                version="1.0.0",
                description=f"Optimized template for {module_name} module",
                template_content=template_content,
                optimization_results=asdict(optimization_results) if hasattr(optimization_results, '__dict__') else optimization_results,
                performance_metrics={
                    "performance_before": optimization_results.performance_before,
                    "performance_after": optimization_results.performance_after,
                    "improvement_percentage": optimization_results.improvement_percentage,
                    "compilation_time": optimization_results.compilation_time_seconds
                },
                created_at=datetime.utcnow().isoformat(),
                updated_at=datetime.utcnow().isoformat(),
                metadata={
                    "optimizer_type": getattr(optimization_results, 'optimizer_type', 'unknown'),
                    "dataset_size": getattr(optimization_results, 'dataset_size', 0),
                    "validation_metrics": optimization_results.validation_metrics
                }
            )
            
            self.templates[template_id] = template
            
            # Create initial version
            version = TemplateVersion(
                template_id=template_id,
                version="1.0.0",
                changes="Initial optimized version",
                performance_before=optimization_results.performance_before,
                performance_after=optimization_results.performance_after,
                created_at=datetime.utcnow().isoformat(),
                created_by="dspy_optimizer"
            )
            
            if template_id not in self.template_versions:
                self.template_versions[template_id] = []
            self.template_versions[template_id].append(version)
            
            # Save to storage
            await self._save_templates()
            
            logger.info(f"Saved optimized template {template_id} for module {module_name}")
            return template_id
            
        except Exception as e:
            logger.error(f"Failed to save optimized module: {e}")
            raise
    
    def _extract_template_content(self, compiled_module: Any) -> str:
        """Extract prompt template content from compiled DSPy module"""
        try:
            # This is a simplified extraction - in production, you'd want more sophisticated
            # prompt extraction based on the specific DSPy module structure
            
            if hasattr(compiled_module, 'signature'):
                signature_str = str(compiled_module.signature)
            else:
                signature_str = "Unknown signature"
            
            # Try to extract demonstrations/examples if available
            demonstrations = []
            if hasattr(compiled_module, 'demos') and compiled_module.demos:
                demonstrations = [str(demo) for demo in compiled_module.demos[:3]]  # Keep first 3
            
            # Build template content
            template_parts = [
                f"Module: {type(compiled_module).__name__}",
                f"Signature: {signature_str}",
            ]
            
            if demonstrations:
                template_parts.append("Demonstrations:")
                template_parts.extend([f"  {demo}" for demo in demonstrations])
            
            # Try to extract any optimized prompts
            if hasattr(compiled_module, 'predictor') and hasattr(compiled_module.predictor, 'signature'):
                template_parts.append(f"Optimized Signature: {compiled_module.predictor.signature}")
            
            return "\n".join(template_parts)
            
        except Exception as e:
            logger.warning(f"Failed to extract detailed template content: {e}")
            return f"Optimized module: {type(compiled_module).__name__}"
    
    def _get_module_category(self, module_name: str) -> str:
        """Get category for module"""
        categories = {
            "legal_analysis": "Legal",
            "marketing_content": "Marketing", 
            "sales_optimization": "Sales",
            "support_response": "Support"
        }
        return categories.get(module_name, "General")
    
    def get_template(self, template_id: str) -> Optional[PromptTemplate]:
        """Get template by ID"""
        return self.templates.get(template_id)
    
    def get_template_by_name(self, name: str) -> Optional[PromptTemplate]:
        """Get template by name"""
        for template in self.templates.values():
            if template.name == name:
                return template
        return None
    
    def list_templates(
        self,
        category: Optional[str] = None,
        module_name: Optional[str] = None,
        active_only: bool = True
    ) -> List[PromptTemplate]:
        """List templates with filtering"""
        templates = list(self.templates.values())
        
        if category:
            templates = [t for t in templates if t.category == category]
        
        if module_name:
            templates = [t for t in templates if t.module_name == module_name]
        
        if active_only:
            templates = [t for t in templates if t.is_active]
        
        # Sort by performance (best first)
        templates.sort(
            key=lambda t: t.performance_metrics.get('performance_after', 0),
            reverse=True
        )
        
        return templates
    
    def get_best_template_for_module(self, module_name: str) -> Optional[PromptTemplate]:
        """Get the best performing template for a specific module"""
        module_templates = self.list_templates(module_name=module_name)
        return module_templates[0] if module_templates else None
    
    async def update_template(
        self,
        template_id: str,
        updates: Dict[str, Any],
        performance_metrics: Optional[Dict[str, float]] = None
    ) -> bool:
        """Update existing template"""
        try:
            template = self.templates.get(template_id)
            if not template:
                return False
            
            # Create new version
            old_version = template.version
            version_parts = template.version.split('.')
            version_parts[-1] = str(int(version_parts[-1]) + 1)
            new_version = '.'.join(version_parts)
            
            # Update template
            for key, value in updates.items():
                if hasattr(template, key):
                    setattr(template, key, value)
            
            template.version = new_version
            template.updated_at = datetime.utcnow().isoformat()
            
            if performance_metrics:
                old_performance = template.performance_metrics.get('performance_after', 0)
                template.performance_metrics.update(performance_metrics)
                
                # Create version record
                version = TemplateVersion(
                    template_id=template_id,
                    version=new_version,
                    changes=updates.get('description', 'Template updated'),
                    performance_before=old_performance,
                    performance_after=performance_metrics.get('performance_after', old_performance),
                    created_at=datetime.utcnow().isoformat(),
                    created_by="manual_update"
                )
                
                if template_id not in self.template_versions:
                    self.template_versions[template_id] = []
                self.template_versions[template_id].append(version)
            
            await self._save_templates()
            
            logger.info(f"Updated template {template_id} to version {new_version}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to update template: {e}")
            return False
    
    def get_template_versions(self, template_id: str) -> List[TemplateVersion]:
        """Get version history for template"""
        return self.template_versions.get(template_id, [])
    
    async def activate_template_version(
        self,
        template_id: str,
        version: str
    ) -> bool:
        """Activate a specific version of a template"""
        try:
            template = self.templates.get(template_id)
            if not template:
                return False
            
            versions = self.template_versions.get(template_id, [])
            target_version = next((v for v in versions if v.version == version), None)
            
            if not target_version:
                return False
            
            # This would require storing version-specific content
            # For now, we'll just update the active version
            template.version = version
            template.updated_at = datetime.utcnow().isoformat()
            
            await self._save_templates()
            
            logger.info(f"Activated template {template_id} version {version}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to activate template version: {e}")
            return False
    
    async def deactivate_template(self, template_id: str) -> bool:
        """Deactivate a template"""
        try:
            template = self.templates.get(template_id)
            if not template:
                return False
            
            template.is_active = False
            template.updated_at = datetime.utcnow().isoformat()
            
            await self._save_templates()
            
            logger.info(f"Deactivated template {template_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to deactivate template: {e}")
            return False
    
    def get_template_analytics(self) -> Dict[str, Any]:
        """Get analytics for template usage and performance"""
        try:
            analytics = {
                "total_templates": len(self.templates),
                "active_templates": len([t for t in self.templates.values() if t.is_active]),
                "categories": {},
                "modules": {},
                "performance_distribution": {},
                "top_performing_templates": []
            }
            
            # Category distribution
            for template in self.templates.values():
                category = template.category
                if category not in analytics["categories"]:
                    analytics["categories"][category] = 0
                analytics["categories"][category] += 1
            
            # Module distribution
            for template in self.templates.values():
                module = template.module_name
                if module not in analytics["modules"]:
                    analytics["modules"][module] = 0
                analytics["modules"][module] += 1
            
            # Performance distribution
            performances = [
                t.performance_metrics.get('performance_after', 0) 
                for t in self.templates.values()
            ]
            
            if performances:
                analytics["performance_distribution"] = {
                    "min": min(performances),
                    "max": max(performances),
                    "avg": sum(performances) / len(performances),
                    "count": len(performances)
                }
            
            # Top performing templates
            sorted_templates = sorted(
                self.templates.values(),
                key=lambda t: t.performance_metrics.get('improvement_percentage', 0),
                reverse=True
            )
            
            analytics["top_performing_templates"] = [
                {
                    "id": t.id,
                    "name": t.name,
                    "module_name": t.module_name,
                    "improvement_percentage": t.performance_metrics.get('improvement_percentage', 0),
                    "performance_after": t.performance_metrics.get('performance_after', 0)
                }
                for t in sorted_templates[:10]
            ]
            
            return analytics
            
        except Exception as e:
            logger.error(f"Failed to generate template analytics: {e}")
            return {}
    
    async def export_template(
        self,
        template_id: str,
        include_versions: bool = False
    ) -> Dict[str, Any]:
        """Export template for sharing or backup"""
        try:
            template = self.templates.get(template_id)
            if not template:
                raise ValueError(f"Template {template_id} not found")
            
            export_data = {
                "template": asdict(template),
                "exported_at": datetime.utcnow().isoformat()
            }
            
            if include_versions:
                export_data["versions"] = [
                    asdict(version) 
                    for version in self.template_versions.get(template_id, [])
                ]
            
            return export_data
            
        except Exception as e:
            logger.error(f"Failed to export template: {e}")
            raise
    
    async def import_template(self, template_data: Dict[str, Any]) -> str:
        """Import template from export data"""
        try:
            template_dict = template_data["template"]
            template = PromptTemplate(**template_dict)
            
            # Generate new ID to avoid conflicts
            old_id = template.id
            template.id = str(uuid.uuid4())
            template.created_at = datetime.utcnow().isoformat()
            template.updated_at = datetime.utcnow().isoformat()
            
            self.templates[template.id] = template
            
            # Import versions if available
            if "versions" in template_data:
                self.template_versions[template.id] = []
                for version_dict in template_data["versions"]:
                    version = TemplateVersion(**version_dict)
                    version.template_id = template.id  # Update to new template ID
                    self.template_versions[template.id].append(version)
            
            await self._save_templates()
            
            logger.info(f"Imported template {template.id} (was {old_id})")
            return template.id
            
        except Exception as e:
            logger.error(f"Failed to import template: {e}")
            raise
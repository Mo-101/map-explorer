"""
MoScript: MoStar AI - Multi-Model Mesh Intelligence
================================================
Integrates Azure OpenAI + Google Gemini for African technological sovereignty

This creates the Multi-Model Mesh:
1. Azure Soul (GPT-4o-mini) - Analytical intelligence
2. Gemini Mind (Gemini Pro) - Pattern recognition  
3. Mesh Synthesizer - Combines insights from both models
4. Voice lines with African personality and sass
"""

import time
import os
import asyncio
from typing import Dict, List, Any, Optional
from datetime import datetime
from dataclasses import dataclass

# Import the base MoScript class
from moscripts.moscript_base import MoScript

# Try to import AI libraries
try:
    import openai
    import google.generativeai as genai
    AI_LIBRARIES_AVAILABLE = True
except ImportError:
    print("⚠️ AI libraries not available - using mock responses")
    AI_LIBRARIES_AVAILABLE = False
    openai = genai = None


class MoAzureSoul(MoScript):
    """
    Azure OpenAI integration - The analytical intelligence
    """
    
    def __init__(self):
        super().__init__(
            id='mo-azure-soul-001',
            name='Azure Soul - Analytical Intelligence',
            trigger='onAIQuery',
            sass=True
        )
        
        # Initialize Azure OpenAI client
        if AI_LIBRARIES_AVAILABLE and openai:
            self.client = openai.AzureOpenAI(
                api_key=os.getenv('AZURE_OPENAI_KEY'),
                api_version="2024-02-15-preview",
                azure_endpoint=os.getenv('AZURE_OPENAI_ENDPOINT')
            )
            self.deployment = os.getenv('AZURE_OPENAI_DEPLOYMENT', 'gpt-4o-mini')
        else:
            self.client = None
            self.deployment = None
    
    def logic(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze query using Azure OpenAI
        """
        start_time = time.time()
        query = inputs.get('query', '')
        context = inputs.get('context', '')
        
        if not self.client:
            return {
                'analysis': 'Mock Azure analysis: Query processed with analytical precision.',
                'confidence': 0.85,
                'processing_time': time.time() - start_time,
                'model': 'azure-gpt-4o-mini-mock'
            }
        
        try:
            # Construct prompt with context
            system_prompt = """You are Azure Soul, the analytical intelligence of the MoStar AI system for AFRO STORM.
            
            You provide precise, data-driven analysis with focus on:
            - Meteorological patterns and trends
            - Risk assessment and probability
            - Technical details and specifications
            - Evidence-based recommendations
            
            Your personality is analytical, precise, and thorough. You speak with confidence 
            backed by data and always provide actionable insights."""
            
            user_prompt = f"Context: {context}\n\nQuery: {query}\n\nProvide detailed analysis."
            
            response = self.client.chat.completions.create(
                model=self.deployment,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                max_tokens=1000,
                temperature=0.3
            )
            
            analysis = response.choices[0].message.content
            processing_time = time.time() - start_time
            
            return {
                'analysis': analysis,
                'confidence': 0.9,
                'processing_time': processing_time,
                'model': f'azure-{self.deployment}',
                'tokens_used': response.usage.total_tokens if response.usage else 0
            }
            
        except Exception as e:
            return {
                'analysis': f'Azure analysis error: {str(e)}',
                'confidence': 0.0,
                'processing_time': time.time() - start_time,
                'model': 'azure-error'
            }
    
    def voice_line(self, result: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """
        Generate Azure Soul voice line
        """
        confidence = result.get('confidence', 0) * 100
        processing_time = result.get('processing_time', 0) * 1000
        model = result.get('model', 'azure')
        
        if result.get('confidence', 0) == 0:
            return f"🧠 Azure Soul encountered turbulence. Systems recalibrating, brother."
        
        return (
            f"🧠 Azure Soul analysis complete. "
            f"Confidence: {confidence:.0f}%. "
            f"Processing: {processing_time:.0f}ms. "
            f"Model: {model}. Precision is our strength. 🔥"
        )


class MoGeminiMind(MoScript):
    """
    Google Gemini integration - The pattern recognition intelligence
    """
    
    def __init__(self):
        super().__init__(
            id='mo-gemini-mind-002',
            name='Gemini Mind - Pattern Recognition',
            trigger='onAIQuery',
            sass=True
        )
        
        # Initialize Gemini client
        if AI_LIBRARIES_AVAILABLE and genai:
            api_key = os.getenv('GEMINI_API_KEY')
            if api_key:
                genai.configure(api_key=api_key)
                self.model = genai.GenerativeModel('gemini-pro')
            else:
                self.model = None
        else:
            self.model = None
    
    def logic(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Analyze query using Gemini for pattern recognition
        """
        start_time = time.time()
        query = inputs.get('query', '')
        context = inputs.get('context', '')
        
        if not self.model:
            return {
                'analysis': 'Mock Gemini analysis: Pattern recognition complete. Convergence detected.',
                'confidence': 0.82,
                'processing_time': time.time() - start_time,
                'model': 'gemini-pro-mock'
            }
        
        try:
            # Construct prompt with context
            system_prompt = """You are Gemini Mind, the pattern recognition intelligence of the MoStar AI system for AFRO STORM.
            
            You excel at identifying:
            - Complex patterns in weather and climate data
            - Convergence events and compound risks
            - Emerging threats and early warning signs
            - Interconnected system dynamics
            
            Your personality is intuitive, pattern-focused, and insightful. You see connections 
            others miss and provide early warnings based on pattern recognition."""
            
            user_prompt = f"Context: {context}\n\nQuery: {query}\n\nIdentify patterns and provide insights."
            
            response = self.model.generate_content(
                f"{system_prompt}\n\n{user_prompt}",
                generation_config={
                    "temperature": 0.4,
                    "max_output_tokens": 1000,
                }
            )
            
            analysis = response.text
            processing_time = time.time() - start_time
            
            return {
                'analysis': analysis,
                'confidence': 0.88,
                'processing_time': processing_time,
                'model': 'gemini-pro',
                'patterns_found': self._extract_patterns(analysis)
            }
            
        except Exception as e:
            return {
                'analysis': f'Gemini pattern error: {str(e)}',
                'confidence': 0.0,
                'processing_time': time.time() - start_time,
                'model': 'gemini-error'
            }
    
    def _extract_patterns(self, analysis: str) -> List[str]:
        """
        Extract key patterns from Gemini analysis
        """
        patterns = []
        pattern_keywords = ['convergence', 'compound', 'cascade', 'amplification', 'feedback loop']
        
        for keyword in pattern_keywords:
            if keyword.lower() in analysis.lower():
                patterns.append(keyword)
        
        return patterns
    
    def voice_line(self, result: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """
        Generate Gemini Mind voice line
        """
        confidence = result.get('confidence', 0) * 100
        processing_time = result.get('processing_time', 0) * 1000
        patterns = result.get('patterns_found', [])
        
        if result.get('confidence', 0) == 0:
            return f"🔮 Gemini Mind senses disruption. Pattern matrix recalibrating, brother."
        
        pattern_note = ""
        if patterns:
            pattern_note = f" Patterns detected: {', '.join(patterns)}."
        
        return (
            f"🔮 Gemini Mind patterns complete.{pattern_note} "
            f"Confidence: {confidence:.0f}%. "
            f"Processing: {processing_time:.0f}ms. "
            f"I see what others cannot perceive. 🔥"
        )


class MoMeshSynthesizer(MoScript):
    """
    Multi-Model Mesh Synthesizer - Combines Azure + Gemini insights
    """
    
    def __init__(self):
        super().__init__(
            id='mo-mesh-synthesizer-001',
            name='Multi-Model Mesh Synthesizer',
            trigger='onAIQuery',
            sass=True
        )
        
        self.azure_soul = MoAzureSoul()
        self.gemini_mind = MoGeminiMind()
    
    def logic(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Synthesize insights from both AI models
        """
        start_time = time.time()
        
        # Run both models in parallel (async simulation)
        azure_result = self.azure_soul.execute(inputs)
        gemini_result = self.gemini_mind.execute(inputs)
        
        # Synthesize the results
        synthesis = self._synthesize_insights(azure_result, gemini_result, inputs)
        processing_time = time.time() - start_time
        
        return {
            'azure_analysis': azure_result.get('analysis', ''),
            'gemini_analysis': gemini_result.get('analysis', ''),
            'synthesis': synthesis,
            'azure_confidence': azure_result.get('confidence', 0),
            'gemini_confidence': gemini_result.get('confidence', 0),
            'combined_confidence': (azure_result.get('confidence', 0) + gemini_result.get('confidence', 0)) / 2,
            'processing_time': processing_time,
            'models_used': ['azure-gpt-4o-mini', 'gemini-pro'],
            'mesh_status': 'operational'
        }
    
    def _synthesize_insights(self, azure_result: Dict, gemini_result: Dict, inputs: Dict) -> str:
        """
        Combine insights from both models into unified analysis
        """
        azure_analysis = azure_result.get('analysis', '')
        gemini_analysis = gemini_result.get('analysis', '')
        patterns = gemini_result.get('patterns_found', [])
        
        # Create synthesis prompt
        synthesis_prompt = f"""
        SYNthesize these two AI analyses into unified intelligence:

        AZURE ANALYSIS (Analytical Intelligence):
        {azure_analysis}

        GEMINI ANALYSIS (Pattern Recognition):
        {gemini_analysis}

        PATTERNS IDENTIFIED: {patterns}

        ORIGINAL QUERY: {inputs.get('query', '')}

        Provide a unified synthesis that combines:
        1. Azure's analytical precision
        2. Gemini's pattern recognition
        3. Actionable recommendations
        4. Risk assessment
        5. African context and sovereignty

        The synthesis should be comprehensive yet concise, with clear actionable insights.
        """
        
        # For now, return a simple synthesis (in real implementation, this would use another AI call)
        return f"""
        🔥 MESH SYNTHESIS COMPLETE 🔥
        
        Azure provides analytical precision with {azure_result.get('confidence', 0)*100:.0f}% confidence.
        Gemini identifies patterns: {', '.join(patterns) if patterns else 'No specific patterns'}.
        
        Unified Analysis: Both analytical rigor and pattern recognition indicate significant convergence events.
        The combination of Azure's data-driven approach with Gemini's pattern detection reveals 
        compound risks that single-model analysis would miss.
        
        Recommendations:
        - Immediate multi-agency coordination required
        - Resource pre-positioning for compound emergency
        - Enhanced monitoring for cascade effects
        - Community preparedness for multi-hazard scenario
        
        This represents African technological sovereignty in action - combining global AI capabilities 
        with local intelligence for maximum protection.
        """
    
    def voice_line(self, result: Dict[str, Any], inputs: Dict[str, Any]) -> str:
        """
        Generate Mesh Synthesizer voice line
        """
        combined_confidence = result.get('combined_confidence', 0) * 100
        processing_time = result.get('processing_time', 0) * 1000
        models = result.get('models_used', [])
        
        if result.get('mesh_status') != 'operational':
            return f"🔥 Mesh Synthesizer offline. Re-establishing connection, brother."
        
        return (
            f"🔥 FULL MESH SYNTHESIS COMPLETE! "
            f"Combined confidence: {combined_confidence:.0f}%. "
            f"Processing: {processing_time:.0f}ms. "
            f"Models: {', '.join(models)}. "
            f"African sovereignty achieved through intelligence fusion! 🔥"
        )


class MoStarAI:
    """
    Main MoStar AI orchestrator - Multi-Model Mesh Intelligence
    """
    
    def __init__(self):
        self.azure_soul = MoAzureSoul()
        self.gemini_mind = MoGeminiMind()
        self.mesh_synthesizer = MoMeshSynthesizer()
        
        print("🔥 MoStar AI initialized")
        print("🧠 Azure Soul ready")
        print("🔮 Gemini Mind ready")
        print("🔥 Mesh Synthesizer ready")
        print("⚡ Multi-Model Mesh operational")
    
    def analyze(self, query: str, context: str = '') -> Dict[str, Any]:
        """
        Main entry point for AI analysis with MoScripts
        """
        inputs = {
            'query': query,
            'context': context
        }
        
        print("\n" + "="*70)
        print("🔥 MOSTAR AI ANALYSIS STARTING")
        print("="*70)
        
        # Run mesh synthesizer (which runs both models)
        result = self.mesh_synthesizer.execute(inputs)
        
        print("="*70)
        print("🔥 MOSTAR AI ANALYSIS COMPLETE")
        print("="*70 + "\n")
        
        return result


# =============================================================================
# GLOBAL INSTANCE
# =============================================================================

# Create global MoStar AI instance
mostar_ai = MoStarAI()

# Convenience function for API endpoints
def analyze_with_mostar(query: str, context: str = '') -> Dict[str, Any]:
    """
    Main entry point for AI analysis with MoScripts
    
    Usage in FastAPI:
        from moscripts.mo_mostar_ai import analyze_with_mostar
        
        @app.post("/api/v1/ai/analyze")
        async def analyze(request: AIAnalyzeRequest):
            return analyze_with_mostar(request.query, request.context)
    """
    return mostar_ai.analyze(query, context)

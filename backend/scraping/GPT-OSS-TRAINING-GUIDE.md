# GPT-OSS 20B Fine-Tuning Guide for Fine Print AI

This guide explains how to fine-tune the OpenAI GPT-OSS 20B model with our privacy analysis dataset.

## Prerequisites

1. **Update Ollama** to the latest version:
   ```bash
   # macOS
   brew upgrade ollama
   
   # Or download from
   https://ollama.com/download
   ```

2. **System Requirements**:
   - 40GB+ free disk space (for 20B model)
   - 32GB+ RAM recommended
   - GPU with 24GB+ VRAM for efficient training (optional but recommended)

## Quick Start

### 1. Pull the GPT-OSS 20B Model

```bash
# Pull the base model
ollama pull gpt-oss:20b
```

### 2. Simple Fine-Tuning with Ollama

Use the Ollama-based fine-tuning script for quick results:

```bash
# Fine-tune with our privacy dataset
python ollama-finetune.py \
  --dataset lora-training-dataset-expanded.jsonl \
  --model-name fine-print-gpt-oss \
  --test
```

### 3. Advanced LoRA Training (Optional)

For more control over the training process:

```bash
# Install dependencies
pip install -r requirements-training.txt

# Run LoRA fine-tuning
python train-gpt-oss-lora.py \
  --dataset lora-training-dataset-expanded.jsonl \
  --epochs 3 \
  --batch-size 4 \
  --lora-r 64
```

## Training Parameters

### Recommended Settings for Privacy Analysis

- **LoRA Rank (r)**: 64 - Good balance between performance and efficiency
- **Learning Rate**: 2e-4 - Optimal for fine-tuning large models
- **Batch Size**: 4 - Adjust based on available GPU memory
- **Epochs**: 3 - Usually sufficient for our dataset size
- **Quantization**: 8-bit by default, use 4-bit for lower memory usage

### Memory Requirements

| Quantization | GPU Memory | System RAM |
|--------------|------------|------------|
| Full (FP16)  | ~40GB      | 64GB       |
| 8-bit        | ~20GB      | 32GB       |
| 4-bit        | ~12GB      | 16GB       |

## Testing the Fine-Tuned Model

### Interactive Testing

```bash
# Run the fine-tuned model
ollama run fine-print-gpt-oss

# Example prompt
>>> Analyze the following privacy_policy for privacy concerns and assign a risk score.
>>> Document from Facebook (Social Media)
```

### Batch Testing

```python
# Test with multiple examples
python test-fine-tuned-model.py
```

## Expected Results

After fine-tuning, the model should:

1. **Accurately identify privacy risks** in legal documents
2. **Assign consistent risk scores** (0-100 scale)
3. **Detect specific patterns** like:
   - Data sharing with third parties
   - Arbitration clauses
   - Broad liability waivers
   - Children's data handling
4. **Provide clear explanations** for identified risks
5. **Grade documents** from A (excellent) to F (poor)

## Deployment

### Create Production Model

```bash
# Create optimized version
ollama create fine-print-prod -f Modelfile.production

# Push to registry (optional)
ollama push yourusername/fine-print-gpt-oss
```

### Integration with Fine Print AI

```javascript
// Use in the analysis service
const response = await ollama.generate({
  model: 'fine-print-gpt-oss',
  prompt: formatAnalysisPrompt(document),
  options: {
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 2048
  }
});
```

## Troubleshooting

### Model Download Issues

If you get a version error:
```bash
# Update Ollama
brew upgrade ollama

# Or manually download
curl -fsSL https://ollama.com/install.sh | sh
```

### Memory Issues

For limited memory:
```bash
# Use 4-bit quantization
python train-gpt-oss-lora.py --use-4bit

# Or reduce batch size
python train-gpt-oss-lora.py --batch-size 1
```

### Training Errors

If training fails:
1. Check GPU drivers: `nvidia-smi`
2. Verify CUDA installation: `python -c "import torch; print(torch.cuda.is_available())"`
3. Use CPU training (slower): Set `device_map="cpu"` in the script

## Performance Metrics

Expected performance after fine-tuning:

- **Accuracy**: 85-90% on privacy risk detection
- **F1 Score**: 0.82+ on pattern identification
- **Response Time**: 2-5 seconds per document
- **Consistency**: 95%+ agreement on risk grades

## Next Steps

1. **Monitor Performance**: Track accuracy on new documents
2. **Continuous Learning**: Retrain quarterly with new examples
3. **A/B Testing**: Compare with base model performance
4. **Optimization**: Experiment with different LoRA ranks and learning rates

## Dataset Information

Current training dataset:
- **Total Examples**: 194
- **Sources**: Websites (64), iOS Apps (30), Android Apps (50), Chrome Extensions (50)
- **Risk Distribution**: High (38), Medium (156), Low (0)
- **File**: `lora-training-dataset-expanded.jsonl` (76KB)

For questions or issues, refer to the main Fine Print AI documentation.
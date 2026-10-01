/**
 * Topic vocabulary. The scorer tags papers with the canonical topic names from
 * config/topics.yaml plus free-form labels. Canonical names and their common
 * free-form variants collapse into one key with a Traditional Chinese label;
 * any other label keeps its original wording.
 */
const CANONICAL: Array<[label: string, zh: string, aliases: string[]]> = [
  [
    'Large Language Models',
    '大型語言模型',
    ['llm', 'llms', 'large language model', 'large language models', 'language models'],
  ],
  ['Japanese LLM & NLP', '日文 LLM 與 NLP', ['japanese llm', 'japanese nlp']],
  ['Transformer Architecture', 'Transformer 架構', ['transformer', 'transformers', 'attention']],
  [
    'Reasoning & Chain-of-Thought',
    '推理與思維鏈',
    ['reasoning', 'chain-of-thought', 'chain of thought', 'cot', 'llm reasoning'],
  ],
  [
    'Prompting & In-Context Learning',
    '提示與上下文學習',
    ['prompting', 'prompt engineering', 'in-context learning', 'icl'],
  ],
  [
    'RAG & Knowledge',
    'RAG 與知識',
    ['rag', 'retrieval-augmented generation', 'retrieval augmented generation', 'retrieval'],
  ],
  [
    'Agents & Tool Use',
    '代理與工具使用',
    ['agents', 'agent', 'llm agents', 'llm agent', 'ai agents', 'tool use', 'multi-agent systems'],
  ],
  [
    'Code & Programming',
    '程式碼與程式設計',
    ['code generation', 'coding', 'code', 'software engineering', 'program synthesis'],
  ],
  ['Natural Language Processing', '自然語言處理', ['nlp', 'natural language processing']],
  ['AI Safety', 'AI 安全', ['ai safety', 'safety', 'llm safety']],
  ['Alignment & RLHF', '對齊與 RLHF', ['alignment', 'rlhf', 'preference optimization', 'dpo']],
  [
    'Interpretability & Explainability',
    '可解釋性',
    ['interpretability', 'explainability', 'mechanistic interpretability'],
  ],
  [
    'Red Teaming & Evaluation',
    '紅隊測試與評估',
    [
      'evaluation',
      'llm evaluation',
      'benchmark',
      'benchmarks',
      'benchmarking',
      'red teaming',
      'llm-as-judge',
      'llm-as-a-judge',
      'llm-as-judge evaluation',
    ],
  ],
  [
    'Multimodal AI',
    '多模態 AI',
    ['multimodal', 'multimodal ai', 'vision-language models', 'vlm', 'vlms'],
  ],
  ['Computer Vision', '電腦視覺', ['computer vision', 'vision']],
  ['Video & Temporal', '影片與時序', ['video', 'video understanding', 'video generation']],
  ['Speech & Audio', '語音與音訊', ['speech', 'audio', 'speech recognition']],
  [
    'Scaling & Efficiency',
    '擴展與效率',
    ['efficiency', 'scaling', 'scaling laws', 'model compression', 'quantization'],
  ],
  [
    'Training & Optimization',
    '訓練與最佳化',
    ['training', 'optimization', 'fine-tuning', 'pretraining'],
  ],
  ['Data & Datasets', '資料與資料集', ['data', 'datasets', 'dataset', 'synthetic data']],
  ['Long Context & Memory', '長上下文與記憶', ['long context', 'memory', 'long-context']],
  [
    'Inference & Serving',
    '推論與服務部署',
    ['inference', 'serving', 'llm inference', 'inference efficiency'],
  ],
  ['Reinforcement Learning', '強化學習', ['reinforcement learning', 'rl']],
  ['Robotics & Embodied AI', '機器人與具身 AI', ['robotics', 'embodied ai']],
  ['Graph Neural Networks', '圖神經網路', ['gnn', 'graph neural networks']],
  ['Medical & Healthcare AI', '醫療 AI', ['medical ai', 'healthcare', 'clinical nlp']],
  ['Scientific AI', '科學 AI', ['ai for science', 'scientific discovery']],
]

export interface TopicInfo {
  key: string
  label: string
  canonical: boolean
}

const BY_ALIAS = new Map<string, TopicInfo>()
for (const [label, zh, aliases] of CANONICAL) {
  const info: TopicInfo = { key: fold(label), label: zh, canonical: true }
  BY_ALIAS.set(fold(label), info)
  for (const alias of aliases) BY_ALIAS.set(fold(alias), info)
}

function fold(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function topicInfo(raw: string): TopicInfo {
  const key = fold(raw)
  return BY_ALIAS.get(key) ?? { key, label: raw.trim(), canonical: false }
}

/** Deduplicated topics in their original order, canonical labels first-wins. */
export function normalizeTopics(raw: readonly string[] | undefined): TopicInfo[] {
  const seen = new Set<string>()
  const result: TopicInfo[] = []
  for (const value of raw ?? []) {
    if (!value.trim()) continue
    const info = topicInfo(value)
    if (seen.has(info.key)) continue
    seen.add(info.key)
    result.push(info)
  }
  return result
}

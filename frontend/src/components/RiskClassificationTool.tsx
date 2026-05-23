'use client';

import { useState } from 'react';

interface RiskLevel {
  level: 'prohibited' | 'high-risk' | 'limited-risk' | 'minimal-risk';
  title: string;
  description: string;
  color: string;
  bgColor: string;
  borderColor: string;
  examples: string[];
  requirements: string[];
}

const riskLevels: RiskLevel[] = [
  {
    level: 'prohibited',
    title: 'Prohibited AI Practices',
    description: 'AI systems that pose unacceptable risks are banned under EU AI Act Article 5, effective February 2025.',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300',
    examples: [
      'Social scoring systems by public authorities',
      'Real-time biometric surveillance in public spaces (with limited exceptions)',
      'AI that manipulates human behavior subliminally',
      'Exploitation of vulnerabilities of specific groups',
    ],
    requirements: ['Immediate cessation — these systems cannot be deployed'],
  },
  {
    level: 'high-risk',
    title: 'High-Risk AI Systems',
    description: 'AI systems in Annex III areas require full compliance with Articles 9–17, including Article 17 Quality Management (prEN 18286). Deadline: August 2026.',
    color: 'text-orange-700',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-300',
    examples: [
      'AI in critical infrastructure (energy, transport, water)',
      'AI for education and vocational training',
      'AI for employment, worker management, access to self-employment',
      'AI for access to essential services (credit scoring, insurance)',
      'AI in law enforcement and border control',
      'AI in administration of justice',
      'Medical devices using AI',
      'Biometric identification systems',
    ],
    requirements: [
      'Article 9: Risk Management System',
      'Article 10: Data Governance',
      'Article 11: Technical Documentation',
      'Article 12: Record-Keeping & AI Decision Logging',
      'Article 13: Transparency & Explainability',
      'Article 14: Human Oversight',
      'Article 15: Accuracy, Robustness, Cybersecurity',
      'Article 17: Quality Management System (prEN 18286)',
    ],
  },
  {
    level: 'limited-risk',
    title: 'Limited Risk AI Systems',
    description: 'AI systems with specific transparency obligations — primarily disclosure requirements when users interact with AI.',
    color: 'text-yellow-700',
    bgColor: 'bg-yellow-50',
    borderColor: 'border-yellow-300',
    examples: [
      'Chatbots and conversational AI',
      'Deepfake content generators',
      'AI-generated content at scale',
      'Emotion recognition systems (in certain contexts)',
    ],
    requirements: [
      'Transparency: inform users they are interacting with AI',
      'Label AI-generated content appropriately',
      'Maintain transparency for deepfakes',
    ],
  },
  {
    level: 'minimal-risk',
    title: 'Minimal Risk AI Systems',
    description: 'The vast majority of AI applications fall here. No mandatory requirements, but voluntary codes of conduct are encouraged.',
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300',
    examples: [
      'AI-powered spam filters',
      'Product recommendation engines',
      'AI in video games',
      'General-purpose AI writing assistants (non-regulated use)',
    ],
    requirements: [
      'No mandatory EU AI Act requirements',
      'Voluntary codes of conduct encouraged',
      'GPAI model providers have additional obligations',
    ],
  },
];

const classifyQuestions = [
  {
    id: 'prohibited',
    question: 'Does your AI system engage in prohibited practices (social scoring, real-time public biometric surveillance, subliminal manipulation)?',
    yes: 'prohibited',
    no: null,
  },
  {
    id: 'annex3',
    question: 'Is your AI system deployed in a high-risk area (critical infrastructure, employment, education, law enforcement, medical devices, credit scoring)?',
    yes: 'high-risk',
    no: null,
  },
  {
    id: 'transparency',
    question: 'Does your AI system interact with users as a chatbot, generate deepfakes, or create AI-generated content at scale?',
    yes: 'limited-risk',
    no: 'minimal-risk',
  },
];

export default function RiskClassificationTool() {
  const [step, setStep] = useState(0);
  const [result, setResult] = useState<string | null>(null);

  function handleAnswer(answer: boolean) {
    const question = classifyQuestions[step];
    if (answer && question.yes) {
      setResult(question.yes);
    } else if (!answer && question.no) {
      setResult(question.no);
    } else if (!answer && step < classifyQuestions.length - 1) {
      setStep(step + 1);
    }
  }

  function reset() {
    setStep(0);
    setResult(null);
  }

  const resultLevel = result ? riskLevels.find((r) => r.level === result) : null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-8">
      <h3 className="text-xl font-bold text-gray-900 mb-2">EU AI Act Risk Classification Tool</h3>
      <p className="text-gray-600 text-sm mb-6">Answer three quick questions to identify your AI system&apos;s risk category under the EU AI Act.</p>

      {!result ? (
        <div>
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              {classifyQuestions.map((_, i) => (
                <div
                  key={i}
                  className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? 'bg-purple-600' : 'bg-gray-200'}`}
                />
              ))}
            </div>
            <p className="text-sm text-gray-500 mb-3">Question {step + 1} of {classifyQuestions.length}</p>
            <p className="text-lg font-medium text-gray-900 mb-6">{classifyQuestions[step].question}</p>
            <div className="flex gap-4">
              <button
                onClick={() => handleAnswer(true)}
                className="flex-1 py-3 px-6 rounded-xl bg-purple-600 text-white font-semibold hover:bg-purple-700 transition-colors"
              >
                Yes
              </button>
              <button
                onClick={() => handleAnswer(false)}
                className="flex-1 py-3 px-6 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:border-purple-400 hover:text-purple-700 transition-colors"
              >
                No
              </button>
            </div>
          </div>
        </div>
      ) : resultLevel ? (
        <div>
          <div className={`rounded-xl border ${resultLevel.borderColor} ${resultLevel.bgColor} p-6 mb-6`}>
            <h4 className={`text-lg font-bold ${resultLevel.color} mb-2`}>{resultLevel.title}</h4>
            <p className="text-gray-700 text-sm leading-relaxed mb-4">{resultLevel.description}</p>
            {resultLevel.requirements.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-2">Key Requirements:</p>
                <ul className="space-y-1">
                  {resultLevel.requirements.map((req) => (
                    <li key={req} className="text-sm text-gray-700 flex items-start gap-2">
                      <span className="text-purple-600 mt-0.5">&#x2713;</span>
                      {req}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {result === 'high-risk' && (
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-purple-800 font-medium">
                ControlWeave includes built-in Article 17 and prEN 18286-aligned templates, workflows, and evidence tracking for high-risk AI programs.
              </p>
            </div>
          )}
          <button
            onClick={reset}
            className="text-sm text-purple-600 hover:text-purple-700 font-medium underline"
          >
            ← Classify another AI system
          </button>
        </div>
      ) : null}
    </div>
  );
}

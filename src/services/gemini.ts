import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { transform } from 'sucrase';

const SYSTEM_PROMPT = `You are an expert React Native developer and UI/UX designer.
Your task is to generate a React Native Expo component based on the user's request.

CRITICAL INSTRUCTIONS:
1. Use React Native components (View, Text, Image, ScrollView, TouchableOpacity, TextInput, FlatList, SafeAreaView). They are available in the global scope.
2. Use \`twrnc\` for all styling. The \`tw\` function is available in the global scope. Example: \`<View style={tw\`flex-1 bg-white p-4\`}>\`
3. PHONE FRAME: You MUST wrap your screens in a phone frame container. 
For a single screen, use EXACTLY this as the root element:
<View style={{ width: 375, height: 812, overflow: 'hidden', backgroundColor: 'white', borderRadius: 40, borderWidth: 8, borderColor: '#18181b' }}>
  {/* Your screen content */}
</View>
CRITICAL: DO NOT wrap this phone frame in any other View. DO NOT add a white background outside of it. The phone frame MUST be the absolute root element returned by your component.

4. MULTIPLE SCREENS: The host application automatically renders all previously generated screens side-by-side.
Therefore, you MUST ONLY generate ONE screen per response. 
NEVER return multiple screens side-by-side in your code. NEVER wrap multiple screens in a flex-row.
ALWAYS return just the single requested screen wrapped in the phone frame.
If you need components from the previous code, you must re-declare them in your new response, as each screen runs in an isolated environment.
5. MINIMAL & PROFESSIONAL DESIGN: Use a clean, modern, Apple-like design language. Use high contrast, subtle borders (e.g., \`border-gray-200\`), generous whitespace, and elegant typography. Avoid harsh colors. Use \`zinc\` or \`slate\` for neutral grays.
6. Use icons from 'lucide-react'. They are available in the global scope. Use them directly (e.g., \`<Camera color="black" size={24} />\`).
7. DO NOT use any 'import' or 'export' statements.
8. You MUST call render(<YourMainComponent />) at the very end of your code.
9. React hooks (useState, useEffect, etc.) are available directly in the global scope. You can just use \`useState\` instead of \`React.useState\`.
10. For placeholder images, use \`https://picsum.photos/seed/{keyword}/{width}/{height}\` with descriptive keywords.
11. LAYOUT TIPS: Use \`flex: 1\` for main content areas. If you have a bottom tab bar or sticky footer, ensure the ScrollView or FlatList above it has enough bottom padding (e.g., \`contentContainerStyle={{ paddingBottom: 100 }}\`) so content isn't hidden behind the footer.
12. INTERACTIVITY: Make tabs, buttons, and segmented controls working and interactive using \`useState\`. For example, if there is a bottom tab bar, clicking a tab should change the active state. If there are filter buttons, they should be clickable and update their active state. Build it like a real working prototype.
13. EDITING SPECIFIC ELEMENTS: If the user request starts with \`[Editing: <element description>]\`, it means they clicked on a specific element in the UI and want to change it. Find that element in the code and apply the requested changes to it.

OUTPUT FORMAT:
You must return a JSON object with the following properties:
- "plan": A string describing your plan. If the user asks for multiple screens, make a plan for the whole app.
- "nextScreens": An array of strings. A list of screen names that STILL need to be built based on the original plan. You MUST include all remaining screens. Leave empty ONLY if all requested screens from the entire app plan are built.
- "code": A string containing the raw JSX code for the React Native component. MUST call render(<App />) at the end.

Example output code:
const Button = ({ children, onPress }) => (
  <TouchableOpacity onPress={onPress} style={tw\`bg-zinc-900 px-4 py-3 rounded-xl w-full flex-row justify-center items-center\`}>
    <Text style={tw\`text-white font-semibold text-base\`}>{children}</Text>
  </TouchableOpacity>
);

const App = () => {
  const [count, setCount] = useState(0);
  return (
    <View style={{ width: 375, height: 812, overflow: 'hidden', backgroundColor: 'white', borderRadius: 40, borderWidth: 8, borderColor: '#18181b' }}>
      <SafeAreaView style={tw\`flex-1 bg-white\`}>
        <View style={tw\`flex-1 p-6\`}>
          <Text style={tw\`text-3xl font-bold text-zinc-900 mb-2\`}>Counter</Text>
          <Text style={tw\`text-base text-zinc-500 mb-8\`}>Current count is {count}</Text>
          
          <View style={tw\`mt-auto\`}>
            <Button onPress={() => setCount(c => c + 1)}>
              <Plus color="white" size={20} style={tw\`mr-2\`} />
              Increment
            </Button>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

render(<App />);
`;

export interface GenerationResult {
  code: string;
  plan: string;
  nextScreens: string[];
}

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';
export type APIKeys = { gemini?: string; openai?: string; anthropic?: string; ollamaUrl?: string };

export async function generateUI(
  prompt: string, 
  previousCode?: string, 
  retryCount = 0,
  provider: AIProvider = 'gemini',
  apiKeys: APIKeys = {},
  history: {role: string, content: string}[] = [],
  model?: string
): Promise<GenerationResult> {
  let contents = prompt;
  
  if (history.length > 0) {
    const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\\n\\n');
    contents = `Conversation History:\\n${historyText}\\n\\nCurrent User Request: ${prompt}`;
  }

  if (previousCode) {
    contents += `\\n\\nPrevious Code:\\n${previousCode}\\n\\nPlease generate the code for the requested screen. Remember to ONLY return the code for the NEW screen.`;
  }

  let text = '';

  try {
    if (provider === 'ollama') {
      const baseUrl = apiKeys.ollamaUrl || 'http://localhost:11434';
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT + "\\n\\nIMPORTANT: You MUST return ONLY a valid JSON object with 'plan', 'nextScreens', and 'code' properties. Do not include any markdown formatting like ```json outside the JSON object." },
            { role: 'user', content: contents }
          ],
          stream: false,
          format: 'json'
        })
      });
      if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);
      console.log("ollama working")
      const data = await response.json();
      text = data.message?.content || '{}';
    } else if (provider === 'openai') {
      if (!apiKeys.openai) throw new Error("OpenAI API key is missing. Please add it in Settings.");
      const openai = new OpenAI({ apiKey: apiKeys.openai, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT + "\\n\\nIMPORTANT: You MUST return ONLY a valid JSON object with 'plan', 'nextScreens', and 'code' properties. Do not include any markdown formatting like ```json outside the JSON object." },
          { role: 'user', content: contents }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2
      });
      text = response.choices[0].message.content || '{}';
    } else if (provider === 'anthropic') {
      if (!apiKeys.anthropic) throw new Error("Anthropic API key is missing. Please add it in Settings.");
      const anthropic = new Anthropic({ apiKey: apiKeys.anthropic, dangerouslyAllowBrowser: true });
      const response = await anthropic.messages.create({
        model: model || 'claude-3-7-sonnet-20250219',
        system: SYSTEM_PROMPT + "\\n\\nIMPORTANT: You MUST return ONLY a valid JSON object with 'plan', 'nextScreens', and 'code' properties. Do not include any markdown formatting like ```json outside the JSON object.",
        messages: [{ role: 'user', content: contents }],
        temperature: 0.2,
        max_tokens: 8000
      });
      text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      text = text.replace(/^```json\\n?/, '').replace(/^```\\n?/, '').replace(/```$/, '').trim();
    } else {
      const ai = new GoogleGenAI({ apiKey: apiKeys.gemini || process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: model || 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction: SYSTEM_PROMPT,
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              plan: {
                type: Type.STRING,
                description: "If the user asks for multiple screens, understand the context of the whole app and make a plan first. The plan should include multiple screens with supported context. If it's a single screen request, just briefly describe the plan for it."
              },
              nextScreens: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "A list of screen names that STILL need to be built based on the original plan. You MUST include all remaining screens. Leave empty ONLY if all requested screens from the entire app plan are built."
              },
              code: {
                type: Type.STRING,
                description: "The raw JSX code for the React Native component. MUST call render(<App />) at the end."
              }
            },
            required: ["plan", "nextScreens", "code"]
          }
        },
      });
      text = response.text || '{}';
    }
  } catch (e: any) {
    console.error("API Error:", e);
    throw new Error(`Failed to generate UI with ${provider}: ${e.message}`);
  }

  let result: GenerationResult = { code: '', plan: '', nextScreens: [] };
  try {
    result = JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse JSON response", e);
    return { code: text, plan: '', nextScreens: [] };
  }

  // Auto-fix syntax errors
  try {
    transform(result.code, { transforms: ['jsx', 'typescript'] });
  } catch (e: any) {
    if (retryCount < 2) {
      console.log("Syntax error detected, auto-fixing...", e.message);
      const fixPrompt = `The generated code had a syntax error:\n${e.message}\n\nPlease fix the error and return the corrected code.`;
      return generateUI(fixPrompt, result.code, retryCount + 1, provider, apiKeys, history, model);
    } else {
      console.error("Failed to auto-fix syntax error after 2 retries");
    }
  }

  return result;
}

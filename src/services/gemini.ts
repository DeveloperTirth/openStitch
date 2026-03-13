import { GoogleGenAI, Type } from '@google/genai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { transform } from 'sucrase';

/**
 * System prompt for generating new React Native screens from scratch.
 * Provides strict guidelines on styling, layout, and component usage.
 */
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

/**
 * System prompt specifically for editing existing React Native components.
 * Enforces strict rules to prevent the AI from regenerating the entire app or removing existing code.
 */
const EDIT_SYSTEM_PROMPT = `You are an expert React Native developer and UI/UX designer.
Your task is to modify an EXISTING React Native Expo component based on the user's request.

CRITICAL RULES:
1. You MUST NOT return the entire component code. Instead, you must return a list of precise search and replace edits.
2. ONLY apply the user's requested change to the specific element mentioned. Leave the rest of the code EXACTLY as it was.
3. NEVER remove existing code, layout, or styling unless explicitly requested by the user.
4. The "search" string MUST EXACTLY match the existing code, including whitespace and indentation. It should be unique enough to only match the intended part of the code.
5. The "replace" string is the new code that will replace the "search" string.
6. Use React Native components (View, Text, Image, ScrollView, TouchableOpacity, TextInput, FlatList, SafeAreaView). They are available in the global scope.
7. Use \`twrnc\` for all styling. The \`tw\` function is available in the global scope. Example: \`<View style={tw\`flex-1 bg-white p-4\`}>\`
8. DO NOT use any 'import' or 'export' statements.

OUTPUT FORMAT:
You must return a JSON object with the following properties:
- "plan": A brief description of the change you made.
- "nextScreens": An empty array [].
- "edits": An array of edit objects, each containing:
  - "search": The exact string to find in the existing code.
  - "replace": The string to replace it with.
`;

export interface Edit {
  search: string;
  replace: string;
}

export interface GenerationResult {
  code: string;
  plan: string;
  nextScreens: string[];
  edits?: Edit[];
}

export type AIProvider = 'gemini' | 'openai' | 'anthropic' | 'ollama';
export type APIKeys = { gemini?: string; openai?: string; anthropic?: string; ollamaUrl?: string };

/**
 * Generates or edits a React Native UI component using the specified AI provider.
 * 
 * @param prompt - The user's request or instruction.
 * @param previousCode - The existing code to modify (if in edit mode) or reference.
 * @param retryCount - The number of times the generation has been retried due to syntax errors.
 * @param provider - The AI provider to use (gemini, openai, anthropic, ollama).
 * @param apiKeys - The API keys for the selected provider.
 * @param history - The conversation history to provide context.
 * @param model - The specific model to use for generation.
 * @param isEditMode - Whether the request is an edit to an existing component.
 * @returns A promise that resolves to the generated code, plan, and next screens.
 */
export async function generateUI(
  prompt: string, 
  previousCode?: string, 
  retryCount = 0,
  provider: AIProvider = 'gemini',
  apiKeys: APIKeys = {},
  history: {role: string, content: string}[] = [],
  model?: string,
  isEditMode: boolean = false
): Promise<GenerationResult> {
  let contents = prompt;
  
  const activeSystemPrompt = isEditMode ? EDIT_SYSTEM_PROMPT : SYSTEM_PROMPT;
  const jsonInstruction = isEditMode 
    ? "\\n\\nIMPORTANT: You MUST return ONLY a valid JSON object with 'plan', 'nextScreens', and 'edits' properties. Do not include any markdown formatting like ```json outside the JSON object."
    : "\\n\\nIMPORTANT: You MUST return ONLY a valid JSON object with 'plan', 'nextScreens', and 'code' properties. Do not include any markdown formatting like ```json outside the JSON object.";

  if (history.length > 0 && !isEditMode) {
    const historyText = history.map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n\n');
    contents = `Conversation History:\n${historyText}\n\nCurrent User Request: ${prompt}`;
  }

  if (previousCode) {
    if (isEditMode) {
      let editTarget = '';
      let editInstruction = prompt;
      const match = prompt.match(/^\[Editing: (.*?)\] (.*)$/);
      if (match) {
        editTarget = match[1];
        editInstruction = match[2];
        contents = `CURRENT COMPONENT CODE:\n\`\`\`tsx\n${previousCode}\n\`\`\`\n\nUSER EDIT REQUEST:\nTarget Element: ${editTarget}\nInstruction: ${editInstruction}\n\nApply the edit request by providing precise search and replace edits.`;
      } else {
        contents = `CURRENT COMPONENT CODE:\n\`\`\`tsx\n${previousCode}\n\`\`\`\n\nUSER EDIT REQUEST:\n"${prompt}"\n\nApply the edit request by providing precise search and replace edits.`;
      }
    } else {
      contents += `\n\nPrevious Code:\n${previousCode}\n\nPlease generate the code for the requested screen. Remember to ONLY return the code for the NEW screen.`;
    }
  }

  let text = '';

  try {
    if (provider === 'ollama') {
      const baseUrl = apiKeys.ollamaUrl || 'http://localhost:11434';
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: model || 'llama3',
          messages: [
            { role: 'system', content: activeSystemPrompt + jsonInstruction },
            { role: 'user', content: contents }
          ],
          stream: false,
          format: 'json'
        })
      });
      if (!response.ok) throw new Error(`Ollama API error: ${response.statusText}`);
      const data = await response.json();
      text = data.message?.content || '{}';
    } else if (provider === 'openai') {
      if (!apiKeys.openai) throw new Error("OpenAI API key is missing. Please add it in Settings.");
      const openai = new OpenAI({ apiKey: apiKeys.openai, dangerouslyAllowBrowser: true });
      const response = await openai.chat.completions.create({
        model: model || 'gpt-4o',
        messages: [
          { role: 'system', content: activeSystemPrompt + jsonInstruction },
          { role: 'user', content: contents }
        ],
        response_format: { type: 'json_object' },
        temperature: isEditMode ? 0.1 : 0.2
      });
      text = response.choices[0].message.content || '{}';
    } else if (provider === 'anthropic') {
      if (!apiKeys.anthropic) throw new Error("Anthropic API key is missing. Please add it in Settings.");
      const anthropic = new Anthropic({ apiKey: apiKeys.anthropic, dangerouslyAllowBrowser: true });
      const response = await anthropic.messages.create({
        model: model || 'claude-3-7-sonnet-20250219',
        system: activeSystemPrompt + jsonInstruction,
        messages: [{ role: 'user', content: contents }],
        temperature: isEditMode ? 0.1 : 0.2,
        max_tokens: 8000
      });
      text = response.content[0].type === 'text' ? response.content[0].text : '{}';
      text = text.replace(/^```json\\n?/, '').replace(/^```\\n?/, '').replace(/```$/, '').trim();
    } else {
      const ai = new GoogleGenAI({ apiKey: apiKeys.gemini || process.env.GEMINI_API_KEY });
      
      const schemaProperties: any = {
        plan: {
          type: Type.STRING,
          description: isEditMode ? "A brief description of the change you made." : "If the user asks for multiple screens, understand the context of the whole app and make a plan first. The plan should include multiple screens with supported context. If it's a single screen request, just briefly describe the plan for it."
        },
        nextScreens: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: isEditMode ? "An empty array []." : "A list of screen names that STILL need to be built based on the original plan. You MUST include all remaining screens. Leave empty ONLY if all requested screens from the entire app plan are built."
        }
      };

      if (isEditMode) {
        schemaProperties.edits = {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              search: { type: Type.STRING, description: "The exact string to find in the existing code." },
              replace: { type: Type.STRING, description: "The string to replace it with." }
            },
            required: ["search", "replace"]
          },
          description: "An array of search and replace edits to apply to the code."
        };
      } else {
        schemaProperties.code = {
          type: Type.STRING,
          description: "The raw JSX code for the React Native component. MUST call render(<App />) at the end."
        };
      }

      const response = await ai.models.generateContent({
        model: model || 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction: activeSystemPrompt,
          temperature: isEditMode ? 0.1 : 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: schemaProperties,
            required: isEditMode ? ["plan", "nextScreens", "edits"] : ["plan", "nextScreens", "code"]
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

  // Apply edits if in edit mode
  if (isEditMode && previousCode) {
    if (result.edits && result.edits.length > 0) {
      let updatedCode = previousCode;
      for (const edit of result.edits) {
        if (updatedCode.includes(edit.search)) {
          updatedCode = updatedCode.replace(edit.search, edit.replace);
        } else {
          // Fallback: try whitespace-insensitive match
          const escapedSearch = edit.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const searchRegex = new RegExp(escapedSearch.replace(/\s+/g, '\\s*'), 'g');
          if (searchRegex.test(updatedCode)) {
            updatedCode = updatedCode.replace(searchRegex, edit.replace);
          } else {
            console.warn("Edit search string not found in code:", edit.search);
          }
        }
      }
      result.code = updatedCode;
    } else if (!result.code) {
      // If no edits and no code returned, fallback to previous code
      result.code = previousCode;
    }
  }

  // Ensure code is always a string
  result.code = result.code || '';

  // Auto-fix syntax errors
  try {
    if (result.code) {
      transform(result.code, { transforms: ['jsx', 'typescript'] });
    }
  } catch (e: any) {
    if (retryCount < 2 && result.code) {
      console.log("Syntax error detected, auto-fixing...", e.message);
      const fixPrompt = `The generated code had a syntax error:\n${e.message}\n\nPlease fix the error and return the corrected code.`;
      // For auto-fixing, we temporarily disable edit mode so it returns full code
      return generateUI(fixPrompt, result.code, retryCount + 1, provider, apiKeys, history, model, false);
    } else {
      console.error("Failed to auto-fix syntax error after 2 retries");
    }
  }

  return result;
}

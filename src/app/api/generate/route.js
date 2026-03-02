import { HfInference } from "@huggingface/inference";

function parseThinkAndAnswer(text) {
    let answer = text.trim();
    if (text.includes("<think>") && text.includes("</think>")) {
        const parts = text.split("</think>");
        answer = parts[parts.length - 1].trim();
    }
    return answer;
}

export async function POST(request) {
    try {
        const body = await request.json();
        const { negative_texts, hf_token } = body;

        console.log("=== NEXT.JS GENERATION API CALLED ===");
        console.log(`Received ${negative_texts?.length} negative texts.`);

        if (!negative_texts || negative_texts.length === 0 || !hf_token) {
            console.error("Missing texts or token.");
            return Response.json({ error: "Missing required fields" }, { status: 400 });
        }

        const hf = new HfInference(hf_token);
        let prompt = "You are a senior brand manager. Read the following customer complaints and provide 2 short, practical, and professional recommendations to solve these pain points. The response MUST be in English:\n\n";

        for (const text of negative_texts) {
            prompt += `- ${text}\n`;
        }

        console.log("Prompt prepared. Attempting connection to Hugging Face Model (Llama-3.3-70B-Instruct).");

        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const response = await hf.chatCompletion({
                    model: "meta-llama/Llama-3.3-70B-Instruct",
                    messages: [
                        { role: "user", content: prompt }
                    ],
                    max_tokens: 300,
                    temperature: 0.3
                });

                const rawOutput = response.choices[0].message.content;
                const finalAnswer = parseThinkAndAnswer(rawOutput);

                console.log("SUCCESS: Received completion from Hugging Face.");
                return Response.json({ suggestion: finalAnswer }, { status: 200 });

            } catch (err) {
                const errStr = err.message || JSON.stringify(err);
                console.log(`Attempt ${attempt} failed with error:`, errStr);

                if (errStr.includes("429") || errStr.includes("503") || errStr.includes("rate limit") || errStr.includes("loading")) {
                    console.log(`Rate limit or model loading. Retrying in 3 seconds...`);
                    await new Promise(r => setTimeout(r, 3000));
                    continue;
                }

                throw err;
            }
        }

        return Response.json({ error: "İyileştirme önerileri şu anda yoğunluk sebebiyle oluşturulamıyor. Lütfen daha sonra tekrar deneyin." }, { status: 503 });

    } catch (error) {
        console.error("Fatal Error inside Next.js API Generate:", error);
        return Response.json({ error: "İyileştirme önerileri oluşturulamadı. (Hugging Face API Hatası)" }, { status: 500 });
    }
}

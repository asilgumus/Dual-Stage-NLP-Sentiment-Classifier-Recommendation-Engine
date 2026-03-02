import json
import logging
import urllib.request
import urllib.error
import time
from http.server import BaseHTTPRequestHandler
from huggingface_hub import InferenceClient

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HF_API_URL = "https://router.huggingface.co/hf-inference/models/distilbert/distilbert-base-uncased-finetuned-sst-2-english"

def query_hf(text, token):
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = json.dumps({"inputs": text}).encode('utf-8')
    req = urllib.request.Request(HF_API_URL, data=payload, headers=headers, method='POST')
    
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req) as response:
                res_data = json.loads(response.read().decode('utf-8'))
                if isinstance(res_data, list):
                    item = res_data[0]
                    if isinstance(item, list):
                        sorted_item = sorted(item, key=lambda x: x['score'], reverse=True)
                        return sorted_item[0]
                    return item
                return {"label": "UNKNOWN", "score": 0.0}
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(2)
                continue
            error_msg = e.read().decode('utf-8')
            logger.error(f"HF API Error: {error_msg}")
            raise Exception(f"HF API Error: {error_msg}")
    return {"label": "UNKNOWN", "score": 0.0}

def parse_think_and_answer(text: str):
    """DeepSeek'in <think> bloklarını temizler, sadece nihai cevabı döndürür."""
    answer = text.strip()
    if "<think>" in text and "</think>" in text:
        answer = text.split("</think>")[-1].strip()
    return answer

def generate_suggestions(negative_texts, hf_token):
    if not negative_texts or not hf_token:
        return None
        
    client = InferenceClient(api_key=hf_token)
    
    prompt = (
        "You are a senior brand manager. Read the following customer complaints and provide 2 short, practical, and professional recommendations to solve these pain points. The response MUST be in English:\n\n"
    )
    for text in negative_texts:
        prompt += f"- {text}\n"

    for attempt in range(3):
        try:
            completion = client.chat.completions.create(
                model="Qwen/Qwen2.5-72B-Instruct",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=300
            )
            raw_output = completion.choices[0].message.content
            # Qwen 2.5 is a standard instruct model, but we keep parse_think_and_answer just in case
            return parse_think_and_answer(raw_output)
            
        except Exception as e:
            error_str = str(e).lower()
            if "429" in error_str or "503" in error_str or "rate limit" in error_str:
                logger.warning(f"HF InferenceClient Hatası (Rate Limit/Load). Tekrar Deneniyor: {attempt+1}/3")
                time.sleep(3)
                continue
            logger.error(f"HF InferenceClient Hatası: {e}")
            return "İyileştirme önerileri oluşturulamadı. (Hugging Face API Hatası)"
            
    logger.error("Hugging Face API: Maksimum deneme sayısına ulaşıldı (429/503).")
    return "İyileştirme önerileri şu anda yoğunluk sebebiyle oluşturulamıyor. Lütfen daha sonra tekrar deneyin."

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            if content_length == 0:
                self.send_error_response(400, "Empty request body")
                return

            post_data = self.rfile.read(content_length).decode('utf-8')
            req_body = json.loads(post_data)
            
            hf_token = req_body.get('hf_token', '').strip()
            
            if not hf_token:
                self.send_error_response(400, "Hugging Face API token is required for Sentiment Analysis")
                return

            texts = req_body.get('texts', [])
            single_text = req_body.get('text', '')
            
            if single_text and not texts:
                texts = [single_text]
                is_bulk = False
            elif texts:
                is_bulk = True
            else:
                self.send_error_response(400, "Either 'text' or 'texts' array is required")
                return

            texts = [t.strip() for t in texts if t.strip()]
            if not texts:
                self.send_error_response(400, "Provided text is empty")
                return
            
            logger.info(f"Processing {len(texts)} texts (Bulk Mode: {is_bulk})")
            
            if len(texts) > 200:
                self.send_error_response(400, "Maximum 200 lines allowed per request in sequential mode")
                return

            all_results = []
            for t in texts:
                try:
                    result = query_hf(t, hf_token)
                    all_results.append(result)
                except Exception as e:
                    logger.warning(f"Failed to analyze sentence: {t}. Error: {e}")
            
            if not all_results:
                self.send_error_response(500, "Failed to analyze any of the provided texts")
                return

            if not is_bulk:
                result = all_results[0]
                label = result.get('label', 'UNKNOWN')
                score = result.get('score', 0.0)
                
                response_data = {
                    "is_bulk": False,
                    "label": label,
                    "score": float(f"{score:.3f}")
                }
                if label == "NEGATIVE" and hf_token:
                    suggestion = generate_suggestions([texts[0]], hf_token)
                    if suggestion:
                        response_data["improvement_suggestion"] = suggestion
            else:
                total = len(all_results)
                pos_count = sum(1 for r in all_results if r.get('label') == 'POSITIVE')
                neg_count = sum(1 for r in all_results if r.get('label') == 'NEGATIVE')
                neu_count = total - (pos_count + neg_count)
                
                overall_label = "POSITIVE" if pos_count >= neg_count else "NEGATIVE"
                
                response_data = {
                    "is_bulk": True,
                    "total": total,
                    "stats": {
                        "positive": {
                            "count": pos_count,
                            "percentage": round((pos_count / total) * 100, 1) if total > 0 else 0
                        },
                        "negative": {
                            "count": neg_count,
                            "percentage": round((neg_count / total) * 100, 1) if total > 0 else 0
                        },
                        "neutral": {
                            "count": neu_count,
                            "percentage": round((neu_count / total) * 100, 1) if total > 0 else 0
                        }
                    },
                    "overall_label": overall_label
                }
                
                if neg_count > 0 and hf_token:
                    negative_texts = [texts[i] for i, r in enumerate(all_results) if r.get('label') == 'NEGATIVE']
                    # Limit to max 5 texts for API safety
                    suggestion = generate_suggestions(negative_texts[:5], hf_token)
                    if suggestion:
                        response_data["improvement_suggestion"] = suggestion

            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(response_data).encode('utf-8'))

        except Exception as e:
            logger.error(f"Fatal error during analysis: {str(e)}")
            self.send_error_response(500, str(e))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def send_error_response(self, code, message):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({"error": str(message)}).encode('utf-8'))

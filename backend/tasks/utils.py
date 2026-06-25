import os
from pypdf import PdfReader
import docx
import google.generativeai as genai
from django.conf import settings

def extract_text_from_file(file_path):
    """
    Extracts text from PDF, DOCX, and Image files.
    """
    if not os.path.exists(file_path):
        raise ValueError(f"File not found: {file_path}")

    ext = os.path.splitext(file_path)[1].lower()
    text = ""

    if ext == '.pdf':
        try:
            reader = PdfReader(file_path)
            for page in reader.pages:
                text += page.extract_text() or ""
        except Exception as e:
            raise ValueError(f"Failed to extract text from PDF: {str(e)}")

    elif ext in ['.docx', '.doc']:
        try:
            doc = docx.Document(file_path)
            text = "\n".join([p.text for p in doc.paragraphs])
        except Exception as e:
            raise ValueError(f"Failed to extract text from DOCX: {str(e)}")

    elif ext in ['.png', '.jpg', '.jpeg']:
        # Try EasyOCR
        try:
            import easyocr
            reader = easyocr.Reader(['en'], gpu=False)
            results = reader.readtext(file_path, detail=0)
            text = " ".join(results)
        except Exception as ocr_err:
            # Fallback to pytesseract if easyocr fails
            try:
                import pytesseract
                text = pytesseract.image_to_string(file_path)
            except Exception as py_err:
                raise ValueError(
                    f"OCR text extraction failed. EasyOCR error: {str(ocr_err)}. Pytesseract error: {str(py_err)}"
                )
    else:
        raise ValueError(f"Unsupported file extension: {ext}")

    return text.strip()


def call_gemini_api(response_type, text_content):
    """
    Sends the text content to Gemini API based on response_type.
    Falls back to a structured mock response if GEMINI_API_KEY is not configured.
    """
    api_key = getattr(settings, 'GEMINI_API_KEY', None) or os.environ.get('GEMINI_API_KEY')

    # Define prompts
    prompts = {
        'SOLUTION': (
            "You are an educational AI tutor.\n"
            "Analyze the uploaded assignment or question paper.\n"
            "For each question:\n"
            "1. Identify the question.\n"
            "2. Generate a detailed answer.\n"
            "3. Explain the solution step-by-step.\n"
            "4. Highlight important concepts.\n"
            "5. Use clear student-friendly language.\n\n"
            "Format the output strictly as:\n"
            "Question 1:\n"
            "Answer:\n"
            "Explanation:\n\n"
            "Question 2:\n"
            "Answer:\n"
            "Explanation:\n"
        ),
        'SUMMARY': (
            "You are an educational AI tutor.\n"
            "Analyze the uploaded assignment, note, or question paper.\n"
            "Generate a concise and helpful study summary containing:\n"
            "1. Key concepts (what is important)\n"
            "2. Important points (key takeaways)\n"
            "3. Exam tips (tactical advice for students)\n\n"
            "Format the output cleanly using Markdown headers and bullet points."
        ),
        'QUIZ': (
            "You are an educational AI tutor.\n"
            "Analyze the uploaded assignment, note, or question paper.\n"
            "Generate a practice quiz for testing understanding:\n"
            "1. 10 Multiple Choice Questions (MCQs) with 4 options (A, B, C, D) and specify the correct answer for each.\n"
            "2. 5 short-answer questions.\n\n"
            "Format the output cleanly and professionally with clear headings."
        )
    }

    prompt = prompts.get(response_type, prompts['SOLUTION'])

    if not api_key:
        print("[WARNING] GEMINI_API_KEY is not set. Using local mock response data fallback.")
        return get_mock_response(response_type)

    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-2.5-flash")
        full_prompt = f"{prompt}\n\nHere is the extracted content from the document:\n\n{text_content}"
        response = model.generate_content(full_prompt)
        return response.text
    except Exception as e:
        raise ValueError(f"Gemini API Error: {str(e)}")


def get_mock_response(response_type):
    """
    Returns high-quality mockup responses for development.
    """
    if response_type == 'SOLUTION':
        return (
            "Question 1: Explain the difference between primary keys and foreign keys in database design.\n"
            "Answer: A primary key is a field (or combination of fields) that uniquely identifies each record in a database table. A foreign key is a field in one table that references the primary key of another table, establishing a link between them.\n"
            "Explanation: 1. Unique Identification: Every table can have at most one primary key. It ensures there are no duplicate rows.\n"
            "2. Relationship Linking: Foreign keys allow tables to connect. For example, an 'Orders' table might have a foreign key 'customer_id' referencing the primary key 'id' in a 'Customers' table.\n"
            "3. Integrity: Primary keys cannot be NULL. Foreign keys can be NULL unless specified otherwise, helping enforce database relational integrity.\n\n"
            "Question 2: What is the purpose of Data Normalization?\n"
            "Answer: Data Normalization is the process of organizing data in a database to reduce redundancy and prevent data anomalies during insertions, updates, and deletions.\n"
            "Explanation: 1. Normal Forms: The process involves organizing fields into tables and applying rules (like 1NF, 2NF, and 3NF).\n"
            "2. Data Integrity: By eliminating duplicate data, we ensure updates only happen in one place, avoiding inconsistencies.\n"
            "3. Performance: Although normalization saves space, extreme normalization can sometimes slow down queries due to the need for multiple JOIN statements."
        )
    elif response_type == 'SUMMARY':
        return (
            "### 📚 Key Concepts\n"
            "- **Relational Database Management System (RDBMS)**: A DBMS based on the relational model, organizing data into tables with primary and foreign keys.\n"
            "- **Normalization**: A structural optimization technique to eliminate redundancy and maintain database consistency.\n\n"
            "### 📌 Important Points\n"
            "- **ACID Properties**:\n"
            "  - *Atomicity*: All parts of a transaction succeed, or the entire transaction fails.\n"
            "  - *Consistency*: Transactions bring the database from one valid state to another.\n"
            "  - *Isolation*: Concurrent transactions run without interfering with each other.\n"
            "  - *Durability*: Committed transactions are permanently saved.\n"
            "- **SQL Query Flow**: SELECT statements retrieve columns from tables, filter with WHERE, group with GROUP BY, and filter groups with HAVING.\n\n"
            "### 💡 Exam Tips\n"
            "- **Practice JOINs**: Expect questions that require joining 3 or more tables (INNER, LEFT, RIGHT, and FULL OUTER joins).\n"
            "- **ACID Scenarios**: Memorize real-world examples of transaction failures (e.g., bank transfer interrupted halfway) and identify which ACID property was violated."
        )
    elif response_type == 'QUIZ':
        return (
            "### 📝 Practice Quiz: Database Fundamentals\n\n"
            "#### Part 1: Multiple Choice Questions (10 MCQs)\n"
            "1. Which of the following uniquely identifies a record in a table?\n"
            "   - A) Foreign Key\n"
            "   - B) Primary Key\n"
            "   - C) Index\n"
            "   - D) Schema\n"
            "   *Correct Answer: B*\n\n"
            "2. What database property ensures that all transaction operations complete or none do?\n"
            "   - A) Isolation\n"
            "   - B) Durability\n"
            "   - C) Atomicity\n"
            "   - D) Consistency\n"
            "   *Correct Answer: C*\n\n"
            "3. Which SQL clause is used to filter rows after they have been grouped?\n"
            "   - A) WHERE\n"
            "   - B) HAVING\n"
            "   - C) GROUP BY\n"
            "   - D) ORDER BY\n"
            "   *Correct Answer: B*\n\n"
            "*(MCQs 4-10 omitted for brevity of mock output)*\n\n"
            "#### Part 2: Short-Answer Questions (5 Questions)\n"
            "1. What is the difference between a database transaction commit and rollback?\n"
            "2. Define referential integrity and how it is enforced.\n"
            "3. Why is 3rd Normal Form (3NF) preferred in database setups?\n"
            "4. Explain the difference between Clustered and Non-Clustered indexes.\n"
            "5. What is a database deadlock, and how does the DBMS resolve it?"
        )
    return "Mock Response"

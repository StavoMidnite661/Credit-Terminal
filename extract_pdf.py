#!/usr/bin/env python3
"""
PDF Text Extraction Tool
Extracts text content from PDF files using PyPDF2
"""

import sys
try:
    from PyPDF2 import PdfReader
except ImportError:
    print("PyPDF2 not installed. Installing...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "PyPDF2"])
    from PyPDF2 import PdfReader

def extract_pdf_text(pdf_path):
    """Extract all text from a PDF file"""
    try:
        reader = PdfReader(pdf_path)
        text_content = []
        
        print(f"Reading PDF: {pdf_path}")
        print(f"Total pages: {len(reader.pages)}\n")
        print("=" * 80)
        
        for page_num, page in enumerate(reader.pages, 1):
            text = page.extract_text()
            text_content.append(f"\n--- PAGE {page_num} ---\n{text}")
        
        full_text = "\n".join(text_content)
        print(full_text)
        
        # Also save to a text file
        output_file = pdf_path.replace('.pdf', '_extracted.txt')
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(full_text)
        
        print("\n" + "=" * 80)
        print(f"\nText saved to: {output_file}")
        
        return full_text
        
    except Exception as e:
        print(f"Error extracting PDF: {e}")
        return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_pdf.py <path_to_pdf>")
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    extract_pdf_text(pdf_path)

#!/usr/bin/env python3
"""Bounded local text parser. stdin/stdout JSON; never log document bytes or paths."""
import io
import json
import logging
import os
from pathlib import Path
import re
import resource
import socket
import sys
import threading
import time
import zipfile
import xml.etree.ElementTree as ET

MAX_UPLOAD = 5 * 1024 * 1024
MAX_TEXT = 1024 * 1024
MAX_SECTIONS = 2000
MAX_PAGES = 30
MAX_ARCHIVE = 20 * 1024 * 1024
MAX_PART = 2 * 1024 * 1024


class ParseFailure(Exception):
    def __init__(self, code):
        self.code = code


def fail(code):
    raise ParseFailure(code)


def no_network(*_args, **_kwargs):
    raise RuntimeError('Network access is disabled in the document parser.')


def setup_limits():
    logging.disable(logging.CRITICAL)
    socket.socket = no_network
    socket.create_connection = no_network
    resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
    if sys.platform != 'darwin':
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
    else:
        # Darwin does not enforce RLIMIT_AS. Bound RSS in addition to parser byte limits.
        def memory_guard():
            while True:
                if resource.getrusage(resource.RUSAGE_SELF).ru_maxrss > 512 * 1024 * 1024:
                    os._exit(74)
                time.sleep(0.02)
        threading.Thread(target=memory_guard, daemon=True).start()
    resource.setrlimit(resource.RLIMIT_FSIZE, (4 * 1024 * 1024, 4 * 1024 * 1024))
    os.umask(0o077)


def capabilities():
    try:
        import pypdf
        if pypdf.__version__ != '6.13.2':
            fail('RESUME_PARSER_UNAVAILABLE')
    except ImportError:
        fail('RESUME_PARSER_UNAVAILABLE')
    return {'available': True, 'formats': ['pdf', 'docx', 'md', 'txt'], 'pdf_parser': 'pypdf', 'pdf_parser_version': pypdf.__version__}


def normalize(text):
    return text.replace('\r\n', '\n').replace('\r', '\n')


def sections_for(chunks, prefix):
    sections = []
    for index, (text, locator) in enumerate(chunks, 1):
        text = text.strip()
        if not text:
            continue
        # Preserve long paragraphs as bounded consecutive chunks with exact character offsets.
        for offset in range(0, len(text), 4000):
            part = text[offset:offset + 4000]
            section_id = prefix + '-p-' + str(len(sections) + 1).zfill(4)
            location = dict(locator)
            location['paragraph'] = index
            if len(text) > 4000:
                location['character_start'] = offset
                location['character_end'] = offset + len(part)
            sections.append({'id': section_id, 'label': '段落 ' + str(len(sections) + 1), 'text': part, 'locator': location})
            if len(sections) > MAX_SECTIONS:
                fail('RESUME_LIMIT_EXCEEDED')
    return sections


def paragraphs(text, base):
    chunks = []
    buffer = []
    start = 1
    for line_number, line in enumerate(text.split('\n'), 1):
        if not line.strip():
            if buffer:
                chunks.append(('\n'.join(buffer), dict(base, line_start=start, line_end=line_number - 1)))
                buffer = []
        else:
            if not buffer:
                start = line_number
            buffer.append(line)
    if buffer:
        chunks.append(('\n'.join(buffer), dict(base, line_start=start, line_end=len(text.split('\n')))))
    return chunks


def text_document(data, fmt):
    if data.startswith((b'%PDF-', b'PK\x03\x04')):
        fail('RESUME_INVALID_DOCUMENT')
    encoding = 'utf-8-sig'
    if data.startswith((b'\xff\xfe', b'\xfe\xff')):
        encoding = 'utf-16'
    try:
        text = normalize(data.decode(encoding))
    except UnicodeDecodeError:
        fail('RESUME_ENCODING_UNSUPPORTED')
    if '\x00' in text or any(ord(c) < 32 and c not in '\n\t\f' for c in text):
        fail('RESUME_INVALID_DOCUMENT')
    return text, sections_for(paragraphs(text, {'format': fmt}), fmt), {'encoding': encoding, 'parser': 'python-text'}


def pdf_document(data):
    if not data.startswith(b'%PDF-'):
        fail('RESUME_INVALID_DOCUMENT')
    capabilities()
    from pypdf import PdfReader, filters
    for name in ('ZLIB_MAX_OUTPUT_LENGTH', 'LZW_MAX_OUTPUT_LENGTH', 'RUN_LENGTH_MAX_OUTPUT_LENGTH', 'JBIG2_MAX_OUTPUT_LENGTH'):
        setattr(filters, name, MAX_PART)
    reader = PdfReader(io.BytesIO(data), strict=True)
    if reader.is_encrypted:
        fail('RESUME_ENCRYPTED')
    count = len(reader.pages)
    if count > MAX_PAGES:
        fail('RESUME_LIMIT_EXCEEDED')
    all_text, all_chunks = [], []
    byte_count = 0
    stream_bytes = 0
    for index, page in enumerate(reader.pages, 1):
        content = page.get_contents()
        if content is not None:
            stream_bytes += len(content.get_data())
            if stream_bytes > MAX_ARCHIVE:
                fail('RESUME_LIMIT_EXCEEDED')
        text = normalize(page.extract_text() or '')
        byte_count += len(text.encode('utf-8'))
        if byte_count > MAX_TEXT:
            fail('RESUME_LIMIT_EXCEEDED')
        all_text.append(text)
        all_chunks.extend(paragraphs(text, {'format': 'pdf', 'page': index}))
    return '\n\f\n'.join(all_text), sections_for(all_chunks, 'pdf'), {'parser': 'pypdf', 'parser_version': '6.13.2', 'page_count': count, 'ocr_used': False}


def docx_document(data):
    if not data.startswith(b'PK\x03\x04'):
        fail('RESUME_INVALID_DOCUMENT')
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = archive.infolist()
        if len(entries) > 1000 or sum(x.file_size for x in entries) > MAX_ARCHIVE:
            fail('RESUME_LIMIT_EXCEEDED')
        names = set()
        for entry in entries:
            name = entry.filename
            if name in names or name.startswith(('/', '\\')) or '\\' in name or '..' in name.split('/') or entry.flag_bits & 1:
                fail('RESUME_INVALID_DOCUMENT')
            names.add(name)
            if entry.file_size > MAX_ARCHIVE or (entry.file_size > 1024 * 1024 and entry.file_size > max(entry.compress_size, 1) * 200):
                fail('RESUME_LIMIT_EXCEEDED')
        if 'word/document.xml' not in names or '[Content_Types].xml' not in names:
            fail('RESUME_INVALID_DOCUMENT')
        parts = ['word/document.xml'] + sorted(name for name in names if re.fullmatch(r'word/(?:header\d+|footer\d+|footnotes|endnotes)\.xml', name))
        chunks = []
        extracted = []
        ns = '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
        for name in parts:
            if archive.getinfo(name).file_size > MAX_PART:
                fail('RESUME_LIMIT_EXCEEDED')
            xml = archive.read(name).decode('utf-8-sig')
            if re.search(r'<!\s*(?:DOCTYPE|ENTITY)', xml, re.I):
                fail('RESUME_INVALID_DOCUMENT')
            doc = ET.fromstring(xml)
            for index, paragraph in enumerate(doc.iter(ns + 'p'), 1):
                bits = []
                for node in paragraph.iter():
                    if node.tag == ns + 't':
                        bits.append(node.text or '')
                    elif node.tag == ns + 'tab':
                        bits.append('\t')
                    elif node.tag in (ns + 'br', ns + 'cr'):
                        bits.append('\n')
                text = normalize(''.join(bits))
                if text.strip():
                    extracted.append(text)
                    chunks.append((text, {'format': 'docx', 'part': name, 'paragraph_in_part': index}))
        return '\n'.join(extracted), sections_for(chunks, 'docx'), {'parser': 'python-docx-xml', 'included_parts': parts, 'external_relationships_fetched': False}


def parse(request):
    fmt = request.get('format')
    if fmt not in ('pdf', 'docx', 'md', 'txt'):
        fail('RESUME_UNSUPPORTED_FORMAT')
    path = Path(request['path'])
    if path.is_symlink() or not path.is_file():
        fail('RESUME_INVALID_DOCUMENT')
    if path.stat().st_size > MAX_UPLOAD:
        fail('RESUME_UPLOAD_TOO_LARGE')
    data = path.read_bytes()
    if not data:
        fail('RESUME_NO_TEXT')
    if fmt == 'pdf':
        text, sections, metadata = pdf_document(data)
    elif fmt == 'docx':
        text, sections, metadata = docx_document(data)
    else:
        text, sections, metadata = text_document(data, fmt)
    if len(text.encode('utf-8')) > MAX_TEXT:
        fail('RESUME_LIMIT_EXCEEDED')
    if not text.strip() or not sections:
        fail('RESUME_NO_TEXT')
    metadata.update({'format': fmt, 'section_count': len(sections), 'text_bytes': len(text.encode('utf-8')), 'network_requests': 0, 'llm_calls': 0, 'generation_mode': 'rules', 'parser_policy': 'resume-parser-v1'})
    return {'raw_text': text, 'sections': sections, 'metadata': metadata}


def main():
    try:
        setup_limits()
        incoming = sys.stdin.buffer.read(16385)
        if len(incoming) > 16384:
            fail('RESUME_INVALID_DOCUMENT')
        request = json.loads(incoming)
        result = capabilities() if request.get('action') == 'capabilities' else parse(request)
        response = {'status': 'ok', 'result': result}
    except ParseFailure as exc:
        response = {'status': 'error', 'error': {'code': exc.code}}
    except (Exception, MemoryError):
        response = {'status': 'error', 'error': {'code': 'RESUME_INVALID_DOCUMENT'}}
    sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(',', ':')))


if __name__ == '__main__':
    main()

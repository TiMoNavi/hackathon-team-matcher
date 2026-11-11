#!/usr/bin/env python3
"""Create synthetic documents only, without external generators or user materials."""
from pathlib import Path
import io
import json
import sys
import zipfile
from xml.sax.saxutils import escape

LINES = [
    '姓名：合成测试者', '城市：杭州', 'Email: synthetic.resume@example.test',
    '技能：Python, TypeScript, 数据分析',
    '学校：合成大学', '专业：计算机科学', '学历：本科', '开始：2020-09', '结束：2024-06',
    '项目：合成协作工具', '角色：后端开发', '贡献：实现可恢复的资料导入流程',
    '技术：Python, TypeScript', '链接：https://example.test/synthetic-project',
    '公司：合成实验室', '职位：实习开发者', '职责：编写资料校验工具',
    '获奖：合成创新奖', '主办方：合成组织', '日期：2024',
    '自我介绍：喜欢把想法做成可以试用的工具。',
]


def pdf_bytes(lines):
    chars = sorted(set(''.join(lines)))
    mapping = {c: i + 1 for i, c in enumerate(chars)}
    cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /SyntheticUCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n'
    cmap += str(len(chars)) + ' beginbfchar\n'
    cmap += '\n'.join('<%04X> <%s>' % (mapping[c], c.encode('utf-16-be').hex().upper()) for c in chars)
    cmap += '\nendbfchar\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend'
    stream = 'BT /F0 12 Tf 50 780 Td\n' + '\n0 -20 Td\n'.join('<' + ''.join('%04X' % mapping[c] for c in line) + '> Tj' for line in lines) + '\nET'
    def stream_obj(text):
        data=text.encode('ascii');return b'<< /Length '+str(len(data)).encode()+b' >>\nstream\n'+data+b'\nendstream'
    objects = [b'<< /Type /Catalog /Pages 2 0 R >>',b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F0 4 0 R >> >> /Contents 7 0 R >>',b'<< /Type /Font /Subtype /Type0 /BaseFont /SyntheticCJK /Encoding /Identity-H /DescendantFonts [5 0 R] /ToUnicode 6 0 R >>',b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /SyntheticCJK /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 1000 >>',stream_obj(cmap),stream_obj(stream)]
    document=b'%PDF-1.4\n';offsets=[0]
    for i,obj in enumerate(objects,1):
        offsets.append(len(document));document+=str(i).encode()+b' 0 obj\n'+obj+b'\nendobj\n'
    start=len(document);document+=b'xref\n0 8\n0000000000 65535 f \n'
    document+=b''.join(('%010d 00000 n \n'%x).encode() for x in offsets[1:])
    document+=b'trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n'+str(start).encode()+b'\n%%EOF\n'
    return document


def docx_bytes(lines, extra=None, xml=None):
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>')
        archive.writestr('word/document.xml',xml or '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'+''.join('<w:p><w:r><w:t>'+escape(line)+'</w:t></w:r></w:p>' for line in lines)+'</w:body></w:document>')
        for key,value in (extra or {}).items():archive.writestr(key,value)
    return out.getvalue()


def main():
    root=Path(sys.argv[1]).resolve();root.mkdir(parents=True,exist_ok=True)
    text='\n'.join(LINES)+'\n'
    (root/'synthetic.txt').write_text(text,encoding='utf-8')
    (root/'synthetic.md').write_text('# 合成简历\n\n'+text,encoding='utf-8')
    (root/'synthetic-utf16.txt').write_bytes(text.encode('utf-16'))
    (root/'synthetic.pdf').write_bytes(pdf_bytes(LINES))
    (root/'synthetic.docx').write_bytes(docx_bytes(LINES, {'word/_rels/document.xml.rels':'<Relationships><Relationship Target="https://example.test/never-requested" TargetMode="External"/></Relationships>'}))
    (root/'empty.txt').write_text('   \n')
    (root/'bad-encoding.txt').write_bytes(b'\xff\xff\xff')
    (root/'binary.txt').write_bytes(b'Hello\x00World')
    (root/'broken.pdf').write_bytes(b'%PDF-1.4\nnot a real document')
    (root/'spoof.pdf').write_text(text)
    (root/'broken.docx').write_bytes(b'PK\x03\x04incomplete')
    (root/'traversal.docx').write_bytes(docx_bytes(LINES,{'../escape.txt':'bad'}))
    (root/'entities.docx').write_bytes(docx_bytes([],xml='<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///not-read">]><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>&x;</w:t></w:r></w:p></w:body></w:document>'))
    (root/'bomb.docx').write_bytes(docx_bytes(LINES,{'word/large.xml':'x'*(21*1024*1024)}))
    (root/'text-limit.txt').write_text('x'*(1024*1024+1))
    (root/'sections-limit.txt').write_text('\n\n'.join('section '+str(i) for i in range(2001)))
    (root/'upload-limit.txt').write_bytes(b'x'*(5*1024*1024+1))
    (root/'unsupported.html').write_text('<p>not allowed</p>')
    from pypdf import PdfWriter
    writer=PdfWriter();writer.add_blank_page(width=595,height=842)
    writer.write(root/'empty.pdf')
    writer.encrypt('synthetic-only');writer.write(root/'encrypted.pdf')
    writer=PdfWriter()
    for _ in range(31):writer.add_blank_page(width=595,height=842)
    writer.write(root/'page-limit.pdf')
    print(json.dumps({'status':'created','files':len(list(root.iterdir())),'synthetic_only':True}))

if __name__=='__main__':main()

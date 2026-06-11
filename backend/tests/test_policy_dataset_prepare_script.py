from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


REPO_ROOT = Path(__file__).resolve().parents[1].parent
SCRIPT_PATH = REPO_ROOT / "scripts" / "prepare_policy_dataset.py"


def _load_script_module():
    spec = importlib.util.spec_from_file_location("prepare_policy_dataset", SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise AssertionError("Could not load prepare_policy_dataset script.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PolicyDatasetPrepareScriptTests(unittest.TestCase):
    def test_extracts_clean_markdown_from_gov_html_without_page_chrome(self) -> None:
        module = _load_script_module()
        html = """
        <!doctype html>
        <html>
          <head><title>ignored</title><script>bad()</script></head>
          <body>
            <header>网站导航</header>
            <div id="UCAP-CONTENT">
              <p>第一段政策正文。</p>
              <script src="/share.js"></script>
              <p>第二段政策正文。</p>
            </div>
            <footer>版权所有</footer>
          </body>
        </html>
        """

        text = module.extract_clean_text(html)

        self.assertIn("第一段政策正文。", text)
        self.assertIn("第二段政策正文。", text)
        self.assertNotIn("script", text.lower())
        self.assertNotIn("网站导航", text)
        self.assertNotIn("版权所有", text)

    def test_extracts_content_after_head_void_tags(self) -> None:
        module = _load_script_module()
        html = """
        <!doctype html>
        <html>
          <head>
            <meta name="description" content="这只是页面摘要">
            <link rel="stylesheet" href="/page.css">
            <script src="/share.js"></script>
          </head>
          <body>
            <div class="main_content">
              <table><tr><td>标题：</td><td>页面题录不应进入正文</td></tr></table>
              <div class="pages_content mhide" id="UCAP-CONTENT">
                <p>第一条完整政策正文。</p>
                <p>第二条完整政策正文。</p>
              </div>
            </div>
          </body>
        </html>
        """

        text = module.extract_clean_text(html)

        self.assertEqual(text, "第一条完整政策正文。\n\n第二条完整政策正文。")
        self.assertNotIn("页面摘要", text)
        self.assertNotIn("页面题录", text)

    def test_extracts_first_desktop_article_without_mobile_duplicate_or_footer(self) -> None:
        module = _load_script_module()
        html = """
        <html><body>
          <div class="pages_content mhide" id="UCAP-CONTENT">
            <p>政策正文第一段。</p>
            <p>政策正文第二段。</p>
          </div>
          <div class="pages_content pages_contentm pchide">
            <p>政策正文第一段。</p>
            <p>政策正文第二段。</p>
          </div>
          <div id="qr_container">扫一扫在手机打开当前页</div>
          <div class="footer_wrap">版权所有：中国政府网</div>
        </body></html>
        """

        text = module.extract_clean_text(html)

        self.assertEqual(text, "政策正文第一段。\n\n政策正文第二段。")
        self.assertNotIn("扫一扫", text)
        self.assertNotIn("版权所有", text)

    def test_does_not_write_search_summary_when_article_body_is_missing(self) -> None:
        module = _load_script_module()
        record = module.PolicyRecord(
            source_type="department_policy",
            source_url="https://www.gov.cn/zhengce/example.htm",
            title="示例政策",
            published_at="2025-03-04",
            api_id="example",
            summary="示例政策 这只是搜索摘要 为...",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_root = Path(temp_dir) / "policy_dataset"
            with self.assertRaises(ValueError):
                module.write_policy_document(dataset_root, record, "<html><body><script>bad()</script></body></html>")

    def test_does_not_write_image_only_policy_pages_as_complete_text(self) -> None:
        module = _load_script_module()
        html = """
        <html><body>
          <div id="UCAP-CONTENT">
            <p><strong>图片版政策通知</strong></p>
            <p><img src="./page-1.png"></p>
            <p><img src="./page-2.png"></p>
          </div>
        </body></html>
        """
        record = module.PolicyRecord(
            source_type="department_policy",
            source_url="https://www.gov.cn/zhengce/image-only.htm",
            title="图片版政策通知",
            published_at="2025-03-04",
            api_id="image-only",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_root = Path(temp_dir) / "policy_dataset"
            with self.assertRaises(ValueError):
                module.write_policy_document(dataset_root, record, html)

    def test_writes_clean_source_archive_and_registry_records(self) -> None:
        module = _load_script_module()
        html = """
        <html><body>
          <div id="UCAP-CONTENT"><p>支持企业稳岗扩岗。</p></div>
          <script src="wx.js"></script>
        </body></html>
        """
        record = module.PolicyRecord(
            source_type="department_policy",
            source_url="https://www.gov.cn/zhengce/example.htm",
            title="支持企业稳岗扩岗的通知",
            published_at="2025-03-04",
            agency="人力资源社会保障部",
            document_number="人社部发〔2025〕1号",
            source_site="www.gov.cn",
            api_category="bumenfile",
            api_id="example",
            summary="支持企业稳岗扩岗。",
            metadata={"policy_domain": ["就业"]},
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_root = Path(temp_dir) / "policy_dataset"
            output = module.write_policy_document(dataset_root, record, html, save_archive=True)

            source_text = output.source_path.read_text(encoding="utf-8")
            archive_text = output.archive_html_path.read_text(encoding="utf-8")
            manifest_lines = (dataset_root / "registry" / "source_manifest.jsonl").read_text(encoding="utf-8").splitlines()

        self.assertTrue(output.source_path.as_posix().endswith("/source/national/gov_cn/department_policy/2025/03/2025-03-04__支持企业稳岗扩岗的通知__example.md"))
        self.assertIn('source_url: "https://www.gov.cn/zhengce/example.htm"', source_text)
        self.assertIn('api_id: "example"', source_text)
        self.assertIn("支持企业稳岗扩岗。", source_text)
        self.assertNotIn("<script", source_text)
        self.assertIn("<script", archive_text)
        self.assertEqual(len(manifest_lines), 1)
        manifest = json.loads(manifest_lines[0])
        self.assertEqual(manifest["source_url"], "https://www.gov.cn/zhengce/example.htm")
        self.assertEqual(manifest["source_path"], output.source_path.relative_to(dataset_root).as_posix())

    def test_prepare_dataset_skips_existing_clean_source_when_requested(self) -> None:
        module = _load_script_module()
        html = '<html><body><div id="UCAP-CONTENT"><p>已有正文内容。</p><p>继续补足正文内容。</p></div></body></html>'
        record = module.PolicyRecord(
            source_type="department_policy",
            source_url="https://www.gov.cn/zhengce/example.htm",
            title="已有政策",
            published_at="2025-03-04",
            source_site="www.gov.cn",
            api_category="bumenfile",
            api_id="example",
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            dataset_root = Path(temp_dir) / "policy_dataset"
            module.write_policy_document(dataset_root, record, html, save_archive=True)

            with (
                patch.object(module, "search_policy_records", return_value=([record], 1)),
                patch.object(module, "_http_get_text", side_effect=AssertionError("should not fetch existing source")),
            ):
                summary = module.prepare_dataset(
                    dataset_root=dataset_root,
                    source_types=("department_policy",),
                    start_date="2025-01-01",
                    end_date="2025-12-31",
                    skip_existing_source=True,
                )

        self.assertEqual(summary["status"], "succeeded")
        self.assertEqual(summary["document_count"], 0)


if __name__ == "__main__":
    unittest.main()

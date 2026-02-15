#!/usr/bin/env python3
import os

# 依然要在导入模块前设置镜像站和加速环境变量
os.environ["HF_HUB_ENABLE_HF_TRANSFER"] = "1"
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from huggingface_hub import hf_hub_download

# 🚨 关键修复：正确的 Hugging Face 仓库命名空间
REPO_ID = "unsloth/gemma-4-26B-A4B-it-GGUF"
# 设置本地保存路径
LOCAL_DIR = "/home/abyss/models/gemma-4-26B-A4B-it-GGUF"

# 精准指定需要下载的两个文件
FILES_TO_DOWNLOAD = [
    "gemma-4-26B-A4B-it-UD-Q4_K_XL.gguf",  # 主语言模型
    "mmproj-BF16.gguf"           # 视觉投影器 (必下)
]

print(f"📂 准备将模型下载至: {LOCAL_DIR}")
os.makedirs(LOCAL_DIR, exist_ok=True)

for filename in FILES_TO_DOWNLOAD:
    print(f"\n🚀 正在拉取: {filename} ...")
    try:
        # 只下载单个指定文件
        downloaded_path = hf_hub_download(
            repo_id=REPO_ID,
            filename=filename,
            local_dir=LOCAL_DIR
        )
        print(f"✅ {filename} 下载完成！已保存至: {downloaded_path}")
    except Exception as e:
        print(f"❌ {filename} 下载失败: {e}")

print("\n🎉 所有下载任务处理完毕！")

"""
测试远程路径选择器后端 API

验证 list_directory API 是否正常工作
"""

import sys
import os
import json
import urllib.request
import urllib.error
import urllib.parse

# 添加 backend 目录到路径
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from bridge import get_directory_contents

def test_get_directory_contents():
    """测试本地 get_directory_contents 函数"""
    print("=" * 60)
    print("测试 1: get_directory_contents 函数")
    print("=" * 60)
    
    # 测试当前目录
    current_dir = os.getcwd()
    print(f"\n测试路径: {current_dir}")
    
    items = get_directory_contents(current_dir)
    print(f"返回项目数: {len(items)}")
    
    # 显示前 5 个项目
    print("\n前 5 个项目:")
    for item in items[:5]:
        item_type = "📁" if item['isDir'] else "📄"
        size = f"{item['size']:,} bytes" if not item['isDir'] else ""
        print(f"  {item_type} {item['name']:<30} {size}")
    
    # 验证数据结构
    assert len(items) > 0, "应该返回至少一个项目"
    assert 'name' in items[0], "项目应该有 name 字段"
    assert 'path' in items[0], "项目应该有 path 字段"
    assert 'isDir' in items[0], "项目应该有 isDir 字段"
    assert 'size' in items[0], "项目应该有 size 字段"
    
    print("\n✅ 测试 1 通过!")
    return True


def test_windows_drives():
    """测试 Windows 驱动器列表"""
    print("\n" + "=" * 60)
    print("测试 2: Windows 驱动器访问")
    print("=" * 60)
    
    import platform
    if platform.system() != "Windows":
        print("⏭ 跳过 (非 Windows 系统)")
        return True
    
    # 测试 C:\ 和 D:\
    for drive in ['C:\\', 'D:\\']:
        if os.path.exists(drive):
            print(f"\n测试路径: {drive}")
            items = get_directory_contents(drive)
            print(f"返回项目数: {len(items)}")
            
            # 显示前 3 个项目
            for item in items[:3]:
                item_type = "📁" if item['isDir'] else "📄"
                print(f"  {item_type} {item['name']}")
    
    print("\n✅ 测试 2 通过!")
    return True


def test_api_endpoint():
    """测试 REST API 端点（需要服务器运行）"""
    print("\n" + "=" * 60)
    print("测试 3: REST API 端点")
    print("=" * 60)
    
    base_url = "http://127.0.0.1:12345"
    
    # 检查服务器是否运行
    try:
        req = urllib.request.Request(f"{base_url}/api/platform")
        with urllib.request.urlopen(req, timeout=2) as response:
            platform_info = json.loads(response.read().decode('utf-8'))
            print(f"服务器状态: 运行中 (platform: {platform_info})")
    except (urllib.error.URLError, urllib.error.HTTPError):
        print("⚠️ 服务器未运行，跳过 API 测试")
        print("  请运行: python backend/main.py")
        return True
    
    # 测试 GET /api/list_directory
    print("\n测试 GET /api/list_directory:")
    test_path = os.getcwd()
    params = urllib.parse.urlencode({"folder_path": test_path})
    req = urllib.request.Request(f"{base_url}/api/list_directory?{params}")
    with urllib.request.urlopen(req) as response:
        items = json.loads(response.read().decode('utf-8'))
    assert response.status == 200, f"GET 请求应该成功: {response.status}"
    print(f"  返回项目数: {len(items)}")
    
    # 测试 POST /api/list_directory
    print("\n测试 POST /api/list_directory:")
    post_data = json.dumps({"path": test_path}).encode('utf-8')
    req = urllib.request.Request(
        f"{base_url}/api/list_directory",
        data=post_data,
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode('utf-8'))
    assert response.status == 200, f"POST 请求应该成功: {response.status}"
    assert "items" in data, "POST 响应应该包含 items 字段"
    assert "path" in data, "POST 响应应该包含 path 字段"
    print(f"  返回项目数: {len(data['items'])}")
    print(f"  返回路径: {data['path']}")
    
    # 测试 GET /api/has_native_dialogs
    print("\n测试 GET /api/has_native_dialogs:")
    req = urllib.request.Request(f"{base_url}/api/has_native_dialogs")
    with urllib.request.urlopen(req) as response:
        has_dialogs = json.loads(response.read().decode('utf-8'))
    print(f"  原生对话框支持: {has_dialogs}")
    print(f"  (--no-ui 模式下应为 false)")
    
    print("\n✅ 测试 3 通过!")
    return True


def main():
    print("\n🔧 远程路径选择器后端测试\n")
    
    all_passed = True
    
    # 运行测试
    all_passed &= test_get_directory_contents()
    all_passed &= test_windows_drives()
    all_passed &= test_api_endpoint()
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 所有测试通过!")
    else:
        print("❌ 部分测试失败")
        sys.exit(1)
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()

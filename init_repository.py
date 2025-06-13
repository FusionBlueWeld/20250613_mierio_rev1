import os

def create_mierio_structure(base_dir="mierio"):
    """
    mierioディレクトリの直下に指定されたフォルダ構造と空のファイルを作成します。
    """
    
    print(f"'{base_dir}' ディレクトリ直下にファイル構造を作成します...")

    # ルートディレクトリの作成
    os.makedirs(base_dir, exist_ok=True)

    # mierio/app 以下の構造
    app_dir = os.path.join(base_dir, "app")
    os.makedirs(app_dir, exist_ok=True)
    open(os.path.join(app_dir, "main.py"), "a").close()

    static_dir = os.path.join(app_dir, "static")
    os.makedirs(static_dir, exist_ok=True)

    css_dir = os.path.join(static_dir, "css")
    os.makedirs(css_dir, exist_ok=True)
    open(os.path.join(css_dir, "style.css"), "a").close()

    js_dir = os.path.join(static_dir, "js")
    os.makedirs(js_dir, exist_ok=True)
    open(os.path.join(js_dir, "script.js"), "a").close()

    images_dir = os.path.join(static_dir, "images")
    os.makedirs(images_dir, exist_ok=True)

    templates_dir = os.path.join(app_dir, "templates")
    os.makedirs(templates_dir, exist_ok=True)
    open(os.path.join(templates_dir, "index.html"), "a").close()

    # mierio/user_data 以下の構造
    user_data_dir = os.path.join(base_dir, "user_data")
    os.makedirs(user_data_dir, exist_ok=True)

    uploads_dir = os.path.join(user_data_dir, "uploads")
    os.makedirs(uploads_dir, exist_ok=True)

    settings_dir = os.path.join(user_data_dir, "settings")
    os.makedirs(settings_dir, exist_ok=True)

    # mierio 直下のファイル
    open(os.path.join(base_dir, "run.py"), "a").close()
    open(os.path.join(base_dir, "config.py"), "a").close()
    open(os.path.join(base_dir, "requirements.txt"), "a").close()

    print("ファイル構造の作成が完了しました。")
    print(f"ルートディレクトリ: {os.path.abspath(base_dir)}")


if __name__ == "__main__":
    create_mierio_structure()
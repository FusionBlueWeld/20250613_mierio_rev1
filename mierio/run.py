from app.main import app

if __name__ == '__main__':
    # デバッグモードを有効にして、コード変更時に自動でリロードされるようにする
    # 本番環境ではdebug=Falseに設定
    app.run(debug=True)
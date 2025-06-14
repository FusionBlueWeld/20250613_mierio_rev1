from flask import Flask, render_template, request, jsonify, session
import os
import pandas as pd
import plotly.graph_objs as go
import plotly.utils
import json
import numpy as np
from datetime import datetime

app = Flask(__name__)
# セッションを使用するためにSECRET_KEYを設定
# 本番環境ではより複雑で安全なキーを使用すること
app.secret_key = 'super_secret_key_for_mierio_app'

# アップロードファイルの保存先
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'user_data', 'uploads')
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# JSONファイルの保存先 (Fitting/Function用)
SETTINGS_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'user_data', 'settings')
JSON_SUBFOLDER = os.path.join(SETTINGS_FOLDER, 'json')
os.makedirs(JSON_SUBFOLDER, exist_ok=True)


@app.route('/')
def index():
    """
    メインページを表示します。
    """
    return render_template('index.html')

@app.route('/upload_csv', methods=['POST'])
def upload_csv():
    """
    CSVファイルをサーバーにアップロードし、ヘッダー情報を返します。
    Feature/Targetファイルパスとヘッダーはセッションに保存します。
    """
    file_type = request.form.get('file_type') # 'feature' or 'target'
    if not file_type or file_type not in ['feature', 'target']:
        return jsonify({'error': 'Invalid file type specified.'}), 400

    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400
    
    if file and file.filename.endswith('.csv'):
        filename = file.filename
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        try:
            df = pd.read_csv(filepath)
            headers = df.columns.tolist()
            # main_id を除外
            filtered_headers = [h for h in headers if h.lower() != 'main_id']

            # セッションにファイルパスとヘッダーを保存
            session[f'{file_type}_filepath'] = filepath
            session[f'{file_type}_headers'] = filtered_headers
            
            return jsonify({
                'filename': filename,
                'headers': filtered_headers,
                'filepath': filepath,
                'file_type': file_type
            }), 200
        except Exception as e:
            # ファイル読み込みエラーの場合は、セッション情報もクリアする
            session.pop(f'{file_type}_filepath', None)
            session.pop(f'{file_type}_headers', None)
            return jsonify({'error': f'Failed to read CSV or extract headers: {str(e)}'}), 500
    return jsonify({'error': 'Invalid file type'}), 400

@app.route('/get_plot_data', methods=['POST'])
def get_plot_data():
    """
    フロントエンドからのパラメータ選択情報に基づいてPlotlyグラフデータを生成し返します。
    """
    data = request.get_json()
    feature_params = data.get('featureParams', [])
    target_param = data.get('targetParam')

    feature_filepath = session.get('feature_filepath')
    target_filepath = session.get('target_filepath')

    if not feature_filepath or not target_filepath:
        return jsonify({'error': 'Feature or Target CSV file not uploaded.'}), 400

    try:
        df_feature = pd.read_csv(feature_filepath)
        df_target = pd.read_csv(target_filepath)

        # 'main_id'があれば、両方のDataFrameから結合するための準備
        if 'main_id' in df_feature.columns and 'main_id' in df_target.columns:
            # main_idで結合
            df_merged = pd.merge(df_feature, df_target, on='main_id', how='inner')
        else:
            # main_idがなければ、インデックスで結合（行数が同じであることを前提）
            # または、データがすでに結合されていると仮定
            if len(df_feature) != len(df_target):
                 return jsonify({'error': 'Feature and Target CSV files have different number of rows and no common "main_id".'}), 400
            # インデックスで結合する場合、同名のカラムがあると衝突するので、区別できるようにする
            # ただし、今回はFeatureとTargetでカラム名が重複しない前提（通常main_id以外は重複しない）
            df_merged = pd.concat([df_feature, df_target], axis=1)

        df_filtered = df_merged.copy()
        
        x_col = None
        y_col = None
        z_col = target_param # TargetパラメータがZ軸

        # ConstantフィルタリングとX/Y軸の決定
        for param_info in feature_params:
            param_name = param_info['name']
            param_type = param_info['type']
            param_value = param_info.get('value')

            if param_type == 'Constant':
                if param_value is None or param_value == '':
                    # Constantが未入力の場合、グラフは表示しない
                    return jsonify({'error': f"Constant value for '{param_name}' is not provided."}), 400
                
                # パラメータがデータフレームに存在することを確認
                if param_name not in df_filtered.columns:
                    return jsonify({'error': f"Parameter '{param_name}' not found in data for Constant filter."}), 400

                try:
                    # データ型の確認と変換
                    # DataFrameの列を数値型に変換しようと試みる
                    temp_series = pd.to_numeric(df_filtered[param_name], errors='coerce')
                    
                    if not temp_series.isnull().all(): # NaN以外の数値があれば数値として扱う
                        df_filtered[param_name] = temp_series
                        # 数値としてのフィルタリング（許容誤差考慮）
                        tolerance = 1e-9 # 例: 10^-9 の許容誤差
                        df_filtered = df_filtered[np.isclose(df_filtered[param_name].astype(float), float(param_value), atol=tolerance)]
                    else: # 全てNaN、または数値に変換できない場合は文字列として扱う
                         # 文字列としての完全一致フィルタリング
                        df_filtered = df_filtered[df_filtered[param_name] == str(param_value)]
                    
                except ValueError: # float(param_value) 変換でエラー
                    return jsonify({'error': f"Invalid constant value for '{param_name}'. Must be a number or match string value."}), 400
                except KeyError: # param_nameがdf_filtered.columnsに存在しない
                    return jsonify({'error': f"Parameter '{param_name}' not found in Feature data."}), 400

            elif param_type == 'X_axis':
                x_col = param_name
            elif param_type == 'Y_axis':
                y_col = param_name
        
        # 軸がすべて選択され、Targetも選択されているか確認
        if not x_col or not y_col or not z_col:
            return jsonify({'error': 'Please select X-axis, Y-axis, and Target parameter.'}), 400
        
        # フィルタリング後のデータが空の場合
        if df_filtered.empty:
            return jsonify({'error': 'No data matches the selected constant filters.'}), 400

        # Plotlyデータ準備
        # Z軸（カラーマップ）のデータが存在することを確認
        if z_col not in df_filtered.columns:
            return jsonify({'error': f"Target parameter '{z_col}' not found in data."}), 400

        # 数値型に変換できないデータをNaNとし、除外
        for col in [x_col, y_col, z_col]:
            df_filtered[col] = pd.to_numeric(df_filtered[col], errors='coerce')

        df_filtered.dropna(subset=[x_col, y_col, z_col], inplace=True)

        if df_filtered.empty:
            return jsonify({'error': 'No valid numerical data after filtering and type conversion.'}), 400

        # カラーマップの範囲を動的に設定
        z_min = df_filtered[z_col].min()
        z_max = df_filtered[z_col].max()

        scatter_data = go.Scattergl( # 大量のデータに強いScatterglを使用
            x=df_filtered[x_col],
            y=df_filtered[y_col],
            mode='markers',
            marker=dict(
                size=10,
                color=df_filtered[z_col], # Z軸データで色分け
                colorscale='Jet', # カラーマップはjet
                colorbar=dict(title=z_col),
                cmin=z_min, # カラーマップの最小値
                cmax=z_max, # カラーマップの最大値
                showscale=True
            ),
            hoverinfo='x+y+z',
            hovertemplate=f'<b>{x_col}:</b> %{{x}}<br><b>{y_col}:</b> %{{y}}<br><b>{z_col}:</b> %{{marker.color}}<extra></extra>'
        )

        layout = go.Layout(
            title=f'Scatter Plot: {z_col} vs {x_col} and {y_col}',
            xaxis=dict(title=x_col, automargin=True),
            yaxis=dict(title=y_col, automargin=True),
            hovermode='closest',
            margin=dict(t=50, b=50, l=50, r=50),
            uirevision='true' # 軸のズーム/パン状態を維持
        )

        graph_json = json.dumps([scatter_data], cls=plotly.utils.PlotlyJSONEncoder)
        layout_json = json.dumps(layout, cls=plotly.utils.PlotlyJSONEncoder)

        return jsonify({'graph_json': graph_json, 'layout_json': layout_json}), 200

    except FileNotFoundError:
        return jsonify({'error': 'CSV files not found. Please upload them again.'}), 400
    except KeyError as e:
        return jsonify({'error': f'Missing column in CSV: {str(e)}. Please check your CSV headers.'}), 400
    except Exception as e:
        app.logger.error(f"Error in get_plot_data: {e}", exc_info=True)
        return jsonify({'error': f'An unexpected error occurred: {str(e)}'}), 500


@app.route('/get_model_table_headers', methods=['GET'])
def get_model_table_headers():
    """
    MODELタブのテーブル生成に必要なFeatureとTargetのヘッダーを返します。
    """
    feature_headers = session.get('feature_headers', [])
    target_headers = session.get('target_headers', [])

    # main_id を除外したヘッダーのみを返す
    filtered_feature_headers = [h for h in feature_headers if h.lower() != 'main_id']
    filtered_target_headers = [h for h in target_headers if h.lower() != 'main_id']

    if not filtered_feature_headers or not filtered_target_headers:
        return jsonify({'error': 'Feature or Target CSV headers not available. Please upload files.'}), 400

    return jsonify({
        'feature_headers': filtered_feature_headers,
        'target_headers': filtered_target_headers
    }), 200

@app.route('/save_model_config', methods=['POST'])
def save_model_config():
    """
    MODELタブの設定（関数定義とフィッティング設定）をJSONファイルとして保存します。
    """
    data = request.get_json()
    fitting_config = data.get('fittingConfig')
    fitting_method = data.get('fittingMethod')
    functions = data.get('functions')

    if not fitting_config or not functions:
        return jsonify({'error': 'No model configuration data received.'}), 400

    feature_filepath = session.get('feature_filepath')
    target_filepath = session.get('target_filepath')

    if not feature_filepath or not target_filepath:
        return jsonify({'error': 'Feature or Target CSV files not loaded. Cannot save configuration.'}), 400

    save_data = {
        'timestamp': datetime.now().isoformat(),
        'feature_csv_path': os.path.abspath(feature_filepath),
        'target_csv_path': os.path.abspath(target_filepath),
        'fitting_method': fitting_method,
        'fitting_config': fitting_config, # フィッティング設定を統合
        'functions': functions # 関数定義を統合
    }

    timestamp_str = datetime.now().strftime('%Y%m%d%H%M%S')
    filename = f"MODEL_{timestamp_str}.json" # ファイル名をMODEL_yyyymmddHHMMSS.jsonに変更
    filepath = os.path.join(JSON_SUBFOLDER, filename)

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(save_data, f, ensure_ascii=False, indent=4)
        return jsonify({'message': f'Model configuration saved successfully: {filename}', 'filepath': filepath}), 200
    except Exception as e:
        app.logger.error(f"Error saving model config: {e}", exc_info=True)
        return jsonify({'error': f'Failed to save model configuration: {str(e)}'}), 500

@app.route('/load_model_config', methods=['POST'])
def load_model_config():
    """
    MODELタブのJSON設定ファイルをロードし、その内容を返します。
    現在ロードされているCSVファイルのパスとの一致を検証します。
    """
    data = request.get_json()
    json_filename = data.get('filename')

    if not json_filename:
        return jsonify({'error': 'No JSON file name provided.'}), 400

    json_filepath = os.path.join(JSON_SUBFOLDER, json_filename)

    if not os.path.exists(json_filepath):
        return jsonify({'error': f'JSON file not found: {json_filepath}'}), 404
    
    current_feature_filepath = session.get('feature_filepath')
    current_target_filepath = session.get('target_filepath')

    if not current_feature_filepath or not current_target_filepath:
        return jsonify({'error': 'Feature or Target CSV files are not currently loaded. Please load them first.'}), 400

    try:
        with open(json_filepath, 'r', encoding='utf-8') as f:
            loaded_data = json.load(f)
        
        loaded_feature_csv_path = loaded_data.get('feature_csv_path')
        loaded_target_csv_path = loaded_data.get('target_csv_path')

        if not (os.path.normpath(loaded_feature_csv_path) == os.path.normpath(current_feature_filepath) and \
                os.path.normpath(loaded_target_csv_path) == os.path.normpath(current_target_filepath)):
            
            error_detail = f"Loaded Feature Path: {loaded_feature_csv_path}, Current Feature Path: {current_feature_filepath}\n" \
                           f"Loaded Target Path: {loaded_target_csv_path}, Current Target Path: {current_target_filepath}"
            app.logger.warning(f"Path mismatch during model load: {error_detail}")
            return jsonify({'error': 'The configuration file was saved with different CSV files. Please load the matching CSVs first.'}), 400
        
        return jsonify({
            'message': 'Configuration loaded successfully.',
            'fitting_config': loaded_data.get('fitting_config'),
            'fitting_method': loaded_data.get('fitting_method'),
            'functions': loaded_data.get('functions')
        }), 200

    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid JSON format in the selected file.'}), 400
    except Exception as e:
        app.logger.error(f"Error loading model config: {e}", exc_info=True)
        return jsonify({'error': f'Failed to load model configuration: {str(e)}'}), 500
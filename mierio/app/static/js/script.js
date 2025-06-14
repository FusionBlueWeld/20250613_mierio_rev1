// script.js

document.addEventListener('DOMContentLoaded', () => {
    // グローバル変数の宣言
    let featureHeaders = []; // Feature CSVのヘッダー
    let targetHeaders = [];  // Target CSVのヘッダー
    let currentFeatureSelections = {}; // 現在のFeatureパラメータ選択状態 {headerName: {type: 'Constant'/'X_axis'/'Y_axis', value: '...'}}
    let currentTargetSelection = ''; // 現在のTargetパラメータ選択状態

    // MODELタブのドロップダウン選択状態を保持するオブジェクト (旧 fittingSelections)
    let modelFittingSelections = {}; 

    // MODELタブで定義された関数を保持する配列 (旧 currentFunctions)
    let modelFunctions = []; 


    // タブ切り替え機能
    window.openTab = (evt, tabName) => {
        const tabContents = document.getElementsByClassName('tab-content');
        for (let i = 0; i < tabContents.length; i++) {
            tabContents[i].style.display = 'none';
        }

        const tabButtons = document.getElementsByClassName('tab-button');
        for (let i = 0; i < tabButtons.length; i++) {
            tabButtons[i].classList.remove('active');
        }

        document.getElementById(tabName).style.display = 'block';
        evt.currentTarget.classList.add('active');

        // タブ切り替え時の処理
        if (tabName === 'view-tab') {
            updatePlot();
        } else if (tabName === 'model-tab') {
            // MODELタブに切り替わったときに両方のテーブルを更新
            populateFunctionTable(); 
            populateFittingTable(); 
        }
    };

    // 初期表示時に'VIEW'タブをアクティブにする
    document.querySelector('.tab-button.active').click();

    // Plotlyのグラフ表示エリア
    const graphContainer = document.getElementById('graph-container');

    // ファイル選択ボタンの処理 (ファイル名表示とUI更新)
    const featureFileInput = document.getElementById('feature-file-input');
    const featureFileNameDisplay = document.getElementById('feature-file-name');
    featureFileInput.addEventListener('change', async (event) => {
        if (event.target.files.length > 0) {
            featureFileNameDisplay.value = event.target.files[0].name;
            await uploadCSV(event.target.files[0], 'feature');
        } else {
            featureFileNameDisplay.value = '';
            document.getElementById('feature-params-container').innerHTML = '';
            featureHeaders = []; // ヘッダー情報をクリア
            currentFeatureSelections = {}; // 選択状態もクリア
            modelFittingSelections = {}; // MODELタブの選択状態もクリア
            updatePlotDisplayState(); // グラフ表示状態を更新
            populateFittingTable(); // MODELタブのFITTINGテーブルもクリア
        }
    });

    const targetFileInput = document.getElementById('target-file-input');
    const targetFileNameDisplay = document.getElementById('target-file-name');
    targetFileInput.addEventListener('change', async (event) => {
        if (event.target.files.length > 0) {
            targetFileNameDisplay.value = event.target.files[0].name;
            await uploadCSV(event.target.files[0], 'target');
        } else {
            targetFileNameDisplay.value = '';
            document.getElementById('target-params-container').innerHTML = '';
            targetHeaders = []; // ヘッダー情報をクリア
            currentTargetSelection = ''; // 選択状態もクリア
            modelFittingSelections = {}; // MODELタブの選択状態もクリア
            updatePlotDisplayState(); // グラフ表示状態を更新
            populateFittingTable(); // MODELタブのFITTINGテーブルもクリア
        }
    });

    /**
     * CSVファイルをサーバーにアップロードし、ヘッダー情報を取得してUIを更新します。
     * @param {File} file - アップロードするファイルオブジェクト
     * @param {string} fileType - 'feature' または 'target'
     */
    async function uploadCSV(file, fileType) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('file_type', fileType);

        try {
            const response = await fetch('/upload_csv', {
                method: 'POST',
                body: formData,
            });
            const result = await response.json();

            if (response.ok) {
                if (fileType === 'feature') {
                    featureHeaders = result.headers;
                    // Featureヘッダーが変わったら、MODELタブの選択状態をリセット
                    modelFittingSelections = {}; 
                    populateFeatureParameters(featureHeaders);
                } else if (fileType === 'target') {
                    targetHeaders = result.headers;
                    // Targetヘッダーが変わったら、MODELタブの選択状態をリセット
                    modelFittingSelections = {};
                    populateTargetParameters(targetHeaders);
                }
                updatePlotDisplayState(); // ファイルがアップロードされたらグラフ表示状態を更新
                updatePlot(); // グラフを描画・更新

                // MODELタブのテーブルも更新
                populateFittingTable(); 

            } else {
                alert(`ファイルのアップロードに失敗しました: ${result.error}`);
                if (fileType === 'feature') {
                    featureFileNameDisplay.value = '';
                    document.getElementById('feature-params-container').innerHTML = '';
                    featureHeaders = [];
                    currentFeatureSelections = {};
                } else if (fileType === 'target') {
                    targetFileNameDisplay.value = '';
                    document.getElementById('target-params-container').innerHTML = '';
                    targetHeaders = [];
                    currentTargetSelection = '';
                }
                modelFittingSelections = {}; // エラー時もクリア
                updatePlotDisplayState(); // エラー時もグラフ表示状態を更新
                populateFittingTable(); // エラー時もテーブルをクリア
            }
        } catch (error) {
            console.error('Error uploading CSV:', error);
            alert(`ファイルアップロード中にエラーが発生しました: ${error.message}`);
        }
    }

    /**
     * グラフの表示/非表示を決定します。
     * Feature/TargetのCSVが両方ロードされており、かつPlotlyが初期化済みの場合に表示。
     */
    function updatePlotDisplayState() {
        if (featureHeaders.length > 0 && targetHeaders.length > 0) {
            graphContainer.style.display = 'flex';
            // Plotlyグラフを初期化（一度だけ）
            if (!graphContainer.dataset.plotlyInitialized || graphContainer.dataset.plotlyInitialized === 'false') {
                 Plotly.newPlot(graphContainer, [], {
                    margin: { t: 50, b: 50, l: 50, r: 50 },
                    xaxis: { title: 'X-axis' },
                    yaxis: { title: 'Y-axis' },
                    hovermode: 'closest',
                    title: 'グラフ表示エリア'
                });
                graphContainer.dataset.plotlyInitialized = 'true';
            }
        } else {
            graphContainer.style.display = 'none';
            graphContainer.dataset.plotlyInitialized = 'false'; // 非表示になったら初期化フラグをリセット
            Plotly.purge(graphContainer); // グラフをクリア
        }
    }

    // LEDボタンのトグル機能
    const ledButtons = document.querySelectorAll('.led-button');
    ledButtons.forEach(button => {
        button.addEventListener('click', () => {
            const ledIndicator = button.querySelector('.led-indicator');
            ledIndicator.classList.toggle('active');
        });
    });

    /**
     * Feature Parameterのドロップダウンを動的に生成し、イベントリスナーを設定します。
     * @param {Array<string>} headers - CSVのヘッダーリスト
     */
    function populateFeatureParameters(headers) {
        const container = document.getElementById('feature-params-container');
        container.innerHTML = ''; // 既存の要素をクリア
        
        featureHeaders.forEach((header, index) => { // グローバル変数featureHeadersを使用
            if (header.toLowerCase() !== 'main_id') {
                const row = document.createElement('div');
                row.classList.add('param-row');
                row.dataset.paramName = header; // パラメータ名をデータ属性として保持

                const dropdown = document.createElement('select');
                dropdown.classList.add('param-dropdown', 'feature-param-dropdown');
                dropdown.innerHTML = `
                    <option value="Constant">Constant</option>
                    <option value="X_axis">X_axis</option>
                    <option value="Y_axis">Y_axis</option>
                `;

                const constantInput = document.createElement('input');
                constantInput.type = 'number';
                constantInput.classList.add('constant-value-input');
                constantInput.placeholder = 'Value (if Constant)';
                constantInput.style.display = 'block'; // デフォルトConstantなので表示

                // 初期状態の選択をcurrentFeatureSelectionsから取得または設定
                if (currentFeatureSelections[header]) {
                    dropdown.value = currentFeatureSelections[header].type;
                    if (currentFeatureSelections[header].type === 'Constant' && currentFeatureSelections[header].value !== undefined) {
                        constantInput.value = currentFeatureSelections[header].value;
                    } else {
                        constantInput.style.display = 'none';
                    }
                } else {
                    // 新しいパラメータはデフォルトでConstantに設定
                    currentFeatureSelections[header] = {type: 'Constant', value: ''};
                }

                dropdown.addEventListener('change', (event) => {
                    const selectedType = event.target.value;
                    constantInput.style.display = (selectedType === 'Constant') ? 'block' : 'none';
                    
                    // 軸の重複チェックと更新
                    handleAxisSelection(header, selectedType);
                    
                    currentFeatureSelections[header].type = selectedType;
                    // Constant以外の場合は値をクリア
                    if (selectedType !== 'Constant') {
                        currentFeatureSelections[header].value = '';
                    } else {
                        // Constantの場合、入力値が既にあれば保持
                        currentFeatureSelections[header].value = constantInput.value;
                    }
                    updatePlot(); // 選択が変更されたらグラフを更新
                });

                constantInput.addEventListener('input', (event) => {
                    currentFeatureSelections[header].value = event.target.value;
                    updatePlot(); // Constant値が変更されたらグラフを更新
                });

                row.appendChild(document.createTextNode(`${index + 1} "${header}" `)); // ヘッダー名表示
                row.appendChild(dropdown);
                row.appendChild(constantInput);
                container.appendChild(row);
            }
        });
        updatePlot(); // 初期表示時にもグラフを更新
    }

    /**
     * X_axis / Y_axis の重複選択を防止し、ドロップダウンを更新します。
     * @param {string} changedParamName - 変更があったパラメータ名
     * @param {string} selectedType - 選択されたタイプ ('X_axis' or 'Y_axis')
     */
    function handleAxisSelection(changedParamName, selectedType) {
        if (selectedType === 'X_axis' || selectedType === 'Y_axis') {
            document.querySelectorAll('.feature-param-dropdown').forEach(dropdown => {
                const paramName = dropdown.closest('.param-row').dataset.paramName;
                if (paramName !== changedParamName && dropdown.value === selectedType) {
                    dropdown.value = 'Constant'; // 重複する軸をConstantに戻す
                    // Constant入力フィールドの表示/非表示も更新
                    const constantInput = dropdown.closest('.param-row').querySelector('.constant-value-input');
                    if (constantInput) constantInput.style.display = 'block';

                    currentFeatureSelections[paramName].type = 'Constant';
                    currentFeatureSelections[paramName].value = constantInput ? constantInput.value : '';
                }
            });
        }
    }


    /**
     * Target Parameterのドロップダウンを動的に生成し、イベントリスナーを設定します。
     * @param {Array<string>} headers - CSVのヘッダーリスト
     */
    function populateTargetParameters(headers) {
        const container = document.getElementById('target-params-container');
        container.innerHTML = ''; // 既存の要素をクリア
        
        const row = document.createElement('div');
        row.classList.add('param-row');
        const select = document.createElement('select');
        select.id = 'target-param-dropdown';
        select.classList.add('param-dropdown');
        select.innerHTML = '<option value="">-- Targetを選択 --</option>';

        targetHeaders.forEach(header => { // グローバル変数targetHeadersを使用
            if (header.toLowerCase() !== 'main_id') {
                const option = document.createElement('option');
                option.value = header;
                option.textContent = header;
                select.appendChild(option);
            }
        });
        
        // 初期状態の選択をcurrentTargetSelectionから取得
        if (currentTargetSelection) {
            select.value = currentTargetSelection;
        }

        select.addEventListener('change', (event) => {
            currentTargetSelection = event.target.value;
            updatePlot(); // 選択が変更されたらグラフを更新
        });

        row.appendChild(select);
        container.appendChild(row);
        updatePlot(); // 初期表示時にもグラフを更新
    }

    /**
     * バックエンドからPlotlyグラフデータを取得し、グラフを更新します。
     */
    async function updatePlot() {
        // 全ての入力が揃っているかチェック
        const selectedX = Object.values(currentFeatureSelections).find(s => s.type === 'X_axis');
        const selectedY = Object.values(currentFeatureSelections).find(s => s.type === 'Y_axis');
        const selectedTarget = currentTargetSelection;

        if (!selectedX || !selectedY || !selectedTarget) {
            graphContainer.style.display = 'none'; // 必須項目が揃っていなければ非表示
            return;
        }

        // Constantで値が未入力のものがないかチェック
        const missingConstantValue = Object.values(currentFeatureSelections).some(s => 
            s.type === 'Constant' && (s.value === '' || s.value === undefined || s.value === null)
        );
        if (missingConstantValue) {
            graphContainer.style.display = 'none'; // Constant値が未入力なら非表示
            return;
        }
        
        // 必須項目が揃っており、Constant値も入力済みならグラフを表示
        graphContainer.style.display = 'flex';
        // Plotlyグラフを初期化（念のため再度チェック）
        if (!graphContainer.dataset.plotlyInitialized || graphContainer.dataset.plotlyInitialized === 'false') {
            Plotly.newPlot(graphContainer, [], {
                margin: { t: 50, b: 50, l: 50, r: 50 },
                xaxis: { title: 'X-axis' },
                yaxis: { title: 'Y-axis' },
                hovermode: 'closest',
                title: 'グラフ表示エリア'
            });
            graphContainer.dataset.plotlyInitialized = 'true';
        }


        // グラフデータ生成のためのペイロード
        const payload = {
            featureParams: Object.keys(currentFeatureSelections).map(key => ({
                name: key,
                type: currentFeatureSelections[key].type,
                value: currentFeatureSelections[key].value
            })),
            targetParam: selectedTarget
        };

        try {
            const response = await fetch('/get_plot_data', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();

            if (response.ok) {
                const graphData = JSON.parse(result.graph_json);
                const graphLayout = JSON.parse(result.layout_json);

                Plotly.react(graphContainer, graphData, graphLayout); // グラフを更新または再描画
            } else {
                console.error('Failed to get plot data:', result.error);
                Plotly.react(graphContainer, [], {title: `グラフ表示エラー: ${result.error}`}); // エラーメッセージをグラフに表示
            }
        } catch (error) {
            console.error('Error fetching plot data:', error);
            Plotly.react(graphContainer, [], {title: `通信エラー: ${error.message}`});
        }
    }


    // MODELタブの線形結合/乗積トグルスイッチのラベル更新
    const fittingMethodToggle = document.getElementById('fitting-method-toggle');
    const fittingMethodLabel = document.getElementById('fitting-method-label');
    fittingMethodToggle.addEventListener('change', () => {
        fittingMethodLabel.textContent = fittingMethodToggle.checked ? '線形結合' : '乗積';
    });

    // MODELタブのFITTING設定テーブルにドロップダウンを生成
    const fittingTableBody = document.querySelector('#fitting-table tbody');
    const modelApplyButton = document.getElementById('model-apply-button');
    const modelLoadButton = document.getElementById('model-load-button');
    const modelJsonInput = document.getElementById('model-json-input'); 

    /**
     * MODELタブのFITTING設定テーブルをFeature/Targetヘッダーに基づいて動的に生成します。
     * 選択状態はmodelFittingSelectionsに保存/復元されます。
     */
    async function populateFittingTable() {
        // Feature/Targetヘッダーがロードされているか確認
        if (featureHeaders.length === 0 || targetHeaders.length === 0) {
            fittingTableBody.innerHTML = '<tr><td colspan="100%">CSVファイルがロードされていません。FeatureとTargetファイルをアップロードしてください。</td></tr>';
            modelApplyButton.disabled = true; 
            return;
        }
        modelApplyButton.disabled = false; 

        // FITTINGテーブルのヘッダーを更新
        const fittingTableHeaderRow = document.querySelector('#fitting-table thead tr');
        fittingTableHeaderRow.innerHTML = '<th></th>'; // Featureヘッダー用の空セル
        targetHeaders.forEach(tHeader => {
            fittingTableHeaderRow.innerHTML += `<th>${tHeader}</th>`;
        });

        fittingTableBody.innerHTML = ''; // 既存の行をクリア

        // modelFunctions (MODELタブの関数選択肢) が最新の状態であることを確認
        // modelFunctionsからavailableFunctionsを構築
        const availableFunctions = modelFunctions.map(func => func.name).filter(name => name); // 有効な関数名のみ
        console.log("Available Functions for Fitting Table:", availableFunctions);


        featureHeaders.forEach(fHeader => {
            const row = document.createElement('tr');
            row.dataset.featureHeader = fHeader; // Featureヘッダー名をデータ属性として保持
            row.innerHTML = `<td>${fHeader}</td>`; // Featureヘッダー名を表示

            targetHeaders.forEach(tHeader => {
                const cell = document.createElement('td');
                const select = document.createElement('select');
                select.classList.add('fitting-dropdown');
                select.innerHTML = '<option value="">--関数を選択--</option>';

                // MODELタブで定義された関数をドロップダウンに追加
                availableFunctions.forEach(funcName => { 
                    const option = document.createElement('option');
                    option.value = funcName;
                    option.textContent = funcName;
                    select.appendChild(option);
                });

                // 既存の選択状態を復元
                if (modelFittingSelections[fHeader] && modelFittingSelections[fHeader][tHeader]) {
                    // ロードされた関数名がドロップダウンの選択肢に存在するか確認
                    const optionExists = Array.from(select.options).some(option => option.value === modelFittingSelections[fHeader][tHeader]);
                    if (optionExists) {
                        select.value = modelFittingSelections[fHeader][tHeader];
                    } else {
                        // 選択肢にない場合はデフォルト値に戻す
                        select.value = '';
                        if (!modelFittingSelections[fHeader]) modelFittingSelections[fHeader] = {};
                        modelFittingSelections[fHeader][tHeader] = ''; // 選択状態もリセット
                    }
                }

                // ドロップダウンの変更イベントをリッスン
                select.addEventListener('change', (event) => {
                    if (!modelFittingSelections[fHeader]) {
                        modelFittingSelections[fHeader] = {};
                    }
                    modelFittingSelections[fHeader][tHeader] = event.target.value;
                    console.log('Model Fitting Selection Updated:', modelFittingSelections); // デバッグ用
                });

                cell.appendChild(select);
                row.appendChild(cell);
            });
            fittingTableBody.appendChild(row);
        });
    }

    // デフォルト関数データ (初回起動時のみ使用。modelFunctionsの初期値として)
    const initialDefaultFunctions = [
        { name: "Func_X1_Zdepth", equation: "exp(-x / scale) + offset", parameters: "scale=300, offset=0.5" },
        { name: "Func_X2_Zdepth", equation: "A * exp(-(y - mu_y)^2 / (2 * sigma_y^2))", parameters: "A=1.0, mu_y=mu_y_final, sigma_y_rise=3.0, sigma_y_fall=3.0 * 1.2" },
        { name: "Func_X3_Zdepth", equation: "(p / max_power)^exponent", parameters: "max_power=6000, exponent=0.7" },
        { name: "Func_X1_Zwidth", equation: "exp(-x / scale) + offset", parameters: "scale=300, offset=0.5" },
        { name: "Func_X2_Zwidth", equation: "1 + coefficient * y^2", parameters: "coefficient=0.03" },
        { name: "Func_X3_Zwidth", equation: "p^exponent", parameters: "exponent=0.4" }
    ];

    // MODELタブのFUNCTION定義テーブル関連
    const addFunctionRowButton = document.getElementById('add-function-row');
    const deleteFunctionRowButton = document.getElementById('delete-function-row');
    const functionTableBody = document.getElementById('function-table-body');

    // 行番号を更新するヘルパー関数
    function updateRowNumbers() {
        const rows = functionTableBody.querySelectorAll('.function-row');
        rows.forEach((row, index) => {
            row.querySelector('td:first-child').textContent = index + 1;
        });
    }

    /**
     * modelFunctions配列に基づいてFUNCTION定義テーブルを再描画します。
     * この関数は、データモデル(modelFunctions)が変更されたときに呼び出されます。
     */
    function populateFunctionTable() {
        functionTableBody.innerHTML = ''; // テーブルの内容を完全にクリア
        modelFunctions.forEach((func, index) => {
            const newRow = document.createElement('tr');
            newRow.classList.add('function-row');
            newRow.dataset.functionIndex = index; // データモデルのインデックスを保存
            newRow.innerHTML = `
                <td></td>
                <td><input type="text" class="function-name" placeholder="関数名" value="${func.name || ''}"></td>
                <td><input type="text" class="function-equation" placeholder="例: a*x+b" value="${func.equation || ''}"></td>
                <td><input type="text" class="function-parameters" placeholder="例: a=1, b=3" value="${func.parameters || ''}"></td>
            `;
            functionTableBody.appendChild(newRow);
        });
        updateRowNumbers();

        // 各入力フィールドにイベントリスナーを再設定
        document.querySelectorAll('#function-table-body .function-row input').forEach(input => {
            input.addEventListener('input', (event) => {
                const row = event.target.closest('.function-row');
                const index = parseInt(row.dataset.functionIndex); 
                const func = modelFunctions[index];

                if (!func) return; 

                if (event.target.classList.contains('function-name')) {
                    func.name = event.target.value.trim();
                    // 関数名が変更されたらFITTING設定テーブルのドロップダウンも更新
                    populateFittingTable(); 
                } else if (event.target.classList.contains('function-equation')) {
                    func.equation = event.target.value.trim();
                } else if (event.target.classList.contains('function-parameters')) {
                    func.parameters = event.target.value.trim();
                }
                
                console.log("modelFunctions Updated:", modelFunctions); 
            });
        });
        
        // 関数リストが変更されたらFITTING設定テーブルも更新
        populateFittingTable(); 
    }

    // DOMContentLoaded時にMODELタブに初期関数をロード
    modelFunctions = [...initialDefaultFunctions];
    populateFunctionTable(); 

    addFunctionRowButton.addEventListener('click', () => {
        modelFunctions.push({ name: "", equation: "", parameters: "" });
        populateFunctionTable(); 
    });

    deleteFunctionRowButton.addEventListener('click', () => {
        if (modelFunctions.length > 0) { 
            modelFunctions.pop(); 
            populateFunctionTable(); 
        }
    });

    // MODELタブ APPLYボタンのクリックイベント (関数定義とフィッティング設定をまとめて保存)
    modelApplyButton.addEventListener('click', async () => {
        const fittingConfigToSend = {};
        document.querySelectorAll('#fitting-table tbody tr').forEach(row => {
            const featureHeader = row.dataset.featureHeader;
            if (featureHeader) {
                fittingConfigToSend[featureHeader] = {};
                row.querySelectorAll('.fitting-dropdown').forEach((dropdown, index) => {
                    const targetHeader = targetHeaders[index]; 
                    fittingConfigToSend[featureHeader][targetHeader] = dropdown.value;
                });
            }
        });

        const fittingMethod = fittingMethodToggle.checked ? '線形結合' : '乗積';

        const payload = {
            fittingConfig: fittingConfigToSend,
            fittingMethod: fittingMethod,
            functions: modelFunctions // 関数定義も一緒に送信
        };

        try {
            const response = await fetch('/save_model_config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload),
            });
            const result = await response.json();

            if (response.ok) {
                alert(`設定が保存されました: ${result.message}`);
                console.log(result.filepath);
                // TODO: VIEWタブのオーバーラップスイッチをONにできるロジックをここに
                overlapToggle.disabled = false; // 仮で有効化
            } else {
                alert(`設定の保存に失敗しました: ${result.error}`);
            }
        } catch (error) {
            console.error('Error saving model config:', error);
            alert(`設定保存中にエラーが発生しました: ${error.message}`);
        }
    });

    // MODELタブ LOADボタン (ファイル選択 input) のイベントリスナー
    modelJsonInput.addEventListener('change', async (event) => {
        if (event.target.files.length > 0) {
            const file = event.target.files[0];
            const filename = file.name;

            try {
                const response = await fetch('/load_model_config', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ filename: filename }), 
                });
                const result = await response.json();

                if (response.ok) {
                    alert(result.message);
                    modelFittingSelections = result.fitting_config || {}; 
                    fittingMethodToggle.checked = (result.fitting_method === '線形結合'); 
                    fittingMethodLabel.textContent = fittingMethodToggle.checked ? '線形結合' : '乗積'; 
                    modelFunctions = result.functions || []; 

                    populateFunctionTable(); 
                    populateFittingTable(); 

                    overlapToggle.disabled = false; // 仮で有効化
                } else {
                    alert(`設定のロードに失敗しました: ${result.error}`);
                }
            } catch (error) {
                console.error('Error loading model config:', error);
                alert(`設定ロード中にエラーが発生しました: ${error.message}`);
            }
        }
    });

    // 「LOAD」ボタンクリックでinput[type="file"]をトリガー
    modelLoadButton.addEventListener('click', () => {
        modelJsonInput.click();
    });


    // OVERLAP, LEARNING, THRESHOLD関連の要素
    const learningButton = document.getElementById('learning-button');
    const progressBarContainer = document.getElementById('learning-progress-bar-container');
    const progressBar = document.getElementById('learning-progress-bar');
    const progressText = document.getElementById('learning-progress-text');
    const overlapToggle = document.getElementById('overlap-toggle');
    const thresholdButton = document.getElementById('threshold-button');
    const thresholdValueInput = document.getElementById('threshold-value');
    
    // VIEWタブのインタラクションの初期状態（常に無効）
    overlapToggle.disabled = true;
    learningButton.disabled = true;
    thresholdButton.disabled = true;
    thresholdValueInput.disabled = true;

    // Thresholdボタンのトグル動作（色変更）
    thresholdButton.addEventListener('click', () => {
        thresholdButton.classList.toggle('active');
        // TODO: ここでThresholdラインの表示/非表示を切り替えるロジックを実装
    });

    // LEARNING Progress Bar (デモ)
    let progressInterval;
    learningButton.addEventListener('click', () => {
        if (overlapToggle.checked) {
            progressBarContainer.style.display = 'block';
            progressBar.style.width = '0%';
            progressText.textContent = '0%';
            let progress = 0;
            const totalSteps = 100;
            const updateInterval = 50; 

            progressInterval = setInterval(() => {
                progress += 1;
                if (progress <= totalSteps) {
                    progressBar.style.width = `${progress}%`;
                    progressText.textContent = `${progress}%`;

                    if (progress % 20 === 0 && progress < 100) {
                        console.log(`Updating graph at ${progress}%`);
                    }
                } else {
                    clearInterval(progressInterval);
                    progressText.textContent = 'Complete!';
                    setTimeout(() => {
                        progressBarContainer.style.display = 'none';
                        progressText.textContent = '';
                    }, 2000);
                }
            }, updateInterval);
        } else {
            alert('LEARNINGを実行するには、オーバーラップスイッチをONにしてください。');
        }
    });

    // OVERLAPスイッチの動作制御
    overlapToggle.addEventListener('change', () => {
        const isOverlapEnabled = overlapToggle.checked;
        const isModelConfigLoaded = true; // 仮のフラグ。実際はMODELタブから有効な設定がロードされているかチェック

        if (isOverlapEnabled && isModelConfigLoaded) {
            learningButton.disabled = false;
            thresholdButton.disabled = false;
            thresholdValueInput.disabled = false;
        } else {
            learningButton.disabled = true;
            thresholdButton.disabled = true;
            thresholdValueInput.disabled = true;
            thresholdButton.classList.remove('active');
        }
    });
});
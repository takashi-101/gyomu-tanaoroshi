/* 層6：見本データ（架空の係の業務10件）。実在の自治体名・個人名は使っていない。 */
(function () {
  'use strict';
  var App = window.App;
  var D = App.data;

  function f(keys) { var o = {}; keys.forEach(function (k) { o[k] = true; }); return o; }
  function imp(b, a, note) {
    var k = ['minutes', 'steps', 'rework', 'staff', 'manual'];
    var o = { before: {}, after: {}, note: note };
    k.forEach(function (x, i) { o.before[x] = b[i]; o.after[x] = a[i]; });
    return o;
  }

  var KAIKEI = '会計課 会計係', MADO = '市民課 窓口係';

  function build() {
    var tasks = [
      {
        name: '支出命令書の審査', category: '審査', section: KAIKEI, role: '主担当（審査）',
        procedure: '各課から回付された支出命令書について、予算科目、金額、債権者、請求書・検収書との一致、支払期日を確認し、不備があれば起票課へ差し戻す。',
        freqUnit: 'day', freqCount: 1, minutes: 90, casesPerMonth: 600, forms: '支出命令書、請求書、検収調書、財務会計システム',
        issues: '月末に回付が集中して滞留する。差戻しの理由が起票課ごとに同じ（添付漏れ・科目誤り）で手戻りが多い。審査中に電話の割り込みが入る。',
        kind: 'routine', need: 'need', ai: 'unknown', transferSoon: 'no',
        burden: f(['daily', 'slow', 'error', 'pressure']), ease: f(['inSection', 'noOutside', 'noSystem', 'docOnly']),
        improve: imp([90, 7, 15, 1, 'no'], [60, 5, 6, 3, 'yes'], '起票課向けの添付書類チェックリストを配布し、審査の確認項目を一覧化')
      },
      {
        name: '例月出納検査資料の作成', category: '検査', section: KAIKEI, role: '主担当',
        procedure: '月末の現金・預金残高を集計し、日計表・預金通帳の写し・歳計外現金の残高と突き合わせ、検査資料一式を作成する。',
        freqUnit: 'month', freqCount: 1, minutes: 480, casesPerMonth: 1, forms: '日計表、預金残高証明、例月出納検査調書、表計算の集計表',
        issues: '残高が合わないときの原因の探し方が担当者の経験に頼っている。作成時期が支払の繁忙と重なる。',
        kind: 'expert', need: 'need', ai: 'no', transferSoon: 'yes',
        burden: f(['personal', 'error', 'pressure']), ease: f(['inSection', 'noRule']),
        handover: {
          decision: '日計表の残高と預金残高に差が出たら、まず差額が過去1週間の個別の収納・支払の金額と一致するかを見る。一致すれば計上日のずれ、一致しなければ転記誤りを疑い、日計表を日付順にさかのぼる。',
          reason: '差額のほとんどは、月末をまたいだ収納の計上日のずれで起きてきた。先に金額の一致を見ると、さかのぼる範囲を絞れる。',
          whyNot: '最初から全件を突き合わせる方法は確実だが、月末の作業時間内に終わらない。',
          exceptions: '差額が端数（数円）の場合は、手数料の計上漏れを先に確かめる。原因が当日中に分からないときは、係長に報告して検査日程を監査事務局と調整する。',
          nonTransferable: '日計表を見て「この並びはおかしい」と気づく感覚は、言葉にしきれない。何か月か一緒に作業して見てもらうしかない。',
          steps: '1. 月末の日計表を出力する\n2. 預金残高証明と残高を突き合わせる\n3. 差があれば差額を控え、過去1週間の収納・支払の金額と照らす\n4. 歳計外現金の残高を確かめる\n5. 検査調書を作成し、係長の確認を受ける',
          updatedAt: '2026-10-20T09:00:00.000Z'
        }
      },
      {
        name: '公金の収納消込', category: '収納', section: KAIKEI, role: '副担当',
        procedure: '指定金融機関からの収納データを取り込み、調定と突き合わせて消し込む。突合できない入金は保留にして所管課に照会する。',
        freqUnit: 'day', freqCount: 2, minutes: 30, casesPerMonth: 1200, forms: '収納データ、財務会計システム、保留一覧（表計算）',
        issues: '保留分を表計算で別管理しており、所管課への照会が二重になることがある。',
        kind: 'routine', need: 'need', ai: 'yes', transferSoon: 'no',
        burden: f(['daily', 'slow', 'error']), ease: f(['inSection', 'noOutside', 'lowImpact'])
      },
      {
        name: '支払に関する問い合わせ対応', category: '照会対応', section: KAIKEI, role: '係員全員',
        procedure: '債権者や庁内各課からの「いつ振り込まれるか」「振込額が違う」などの問い合わせに、支払状況を照会して回答する。',
        freqUnit: 'day', freqCount: 6, minutes: 10, casesPerMonth: 120, forms: '財務会計システム（支払照会）、電話',
        issues: '問い合わせの多くは支払予定日の確認で、同じ回答を繰り返している。審査作業の中断の主な原因。',
        kind: 'routine', need: 'need', ai: 'unknown', transferSoon: 'no',
        burden: f(['daily', 'inquiry', 'pressure']), ease: f(['noRule', 'docOnly'])
      },
      {
        name: '歳計外現金の管理', category: '管理', section: KAIKEI, role: '主担当',
        procedure: '入札保証金・源泉徴収税などの歳計外現金の受入・払出を記帳し、月末に残高を確認する。',
        freqUnit: 'month', freqCount: 2, minutes: 60, casesPerMonth: 30, forms: '歳計外現金整理簿、財務会計システム',
        issues: '件数は少ないが、受入と払出の時期が離れているため、どの受入に対応する払出か分かりにくい。',
        kind: 'expert', need: 'need', ai: 'no', transferSoon: 'yes',
        burden: f(['personal']), ease: f(['inSection', 'noOutside', 'noRule']),
        handover: {
          decision: '払出の依頼が来たら、整理簿で受入の日付・相手方・金額の3つが一致する行を探す。2つしか一致しないときは、払出せずに所管課へ確認する。',
          reason: '同じ相手方から同額の受入が複数あることがあり、取り違えると別の案件の保証金を返すことになる。',
          whyNot: '',
          exceptions: '',
          nonTransferable: '',
          steps: '1. 払出依頼書の受入番号を確かめる\n2. 整理簿で日付・相手方・金額を照らす',
          updatedAt: '2026-10-22T09:00:00.000Z'
        }
      },
      {
        name: '支出伺い台帳への転記', category: '記帳', section: KAIKEI, role: '副担当',
        procedure: '財務会計システムに登録済みの支出負担行為を、紙の支出伺い台帳に手書きで転記する。',
        freqUnit: 'week', freqCount: 2, minutes: 45, casesPerMonth: 80, forms: '支出伺い台帳（紙）、財務会計システム',
        issues: 'システムに同じ内容があり、台帳を参照する人がいない。',
        kind: 'routine', need: 'noneed', ai: 'no', transferSoon: 'no',
        burden: f(['daily', 'slow']), ease: f(['inSection', 'noOutside', 'noRule', 'docOnly']),
        improve: imp([45, 3, 0, 1, 'no'], [0, 0, 0, 1, 'no'], '係内で確認し、台帳への転記をやめてシステムの帳票出力に切り替え')
      },
      {
        name: '住民票の写し等の交付', category: '受付・交付', section: MADO, role: '窓口担当（交代制）',
        procedure: '請求書を受け付け、本人確認書類と請求事由を確認し、システムから発行して手数料を収納し交付する。',
        freqUnit: 'day', freqCount: 40, minutes: 8, casesPerMonth: 800, calcMode: 'cases', minutesPerCase: 8, forms: '交付請求書、住民記録システム、レジ',
        issues: '請求書の記入誤りで書き直しが多い。月曜と月末に待ち時間が長くなる。',
        kind: 'routine', need: 'need', ai: 'no', transferSoon: 'no',
        burden: f(['daily', 'error', 'inquiry']), ease: f(['noSystem'])
      },
      {
        name: '転入届の受付', category: '受付', section: MADO, role: '窓口担当（届出）',
        procedure: '転出証明書・本人確認書類を確認して転入届を受け付け、住民記録システムに入力し、関係課（国保・年金・児童手当など）への案内を行う。',
        freqUnit: 'day', freqCount: 8, minutes: 25, casesPerMonth: 160, forms: '転入届、転出証明書、住民記録システム、関係課案内票',
        issues: '世帯の状況によって案内する関係課が変わり、案内漏れが起きる。3月から4月に件数が大きく増える。',
        kind: 'expert', need: 'need', ai: 'no', transferSoon: 'no',
        burden: f(['daily', 'personal', 'error', 'inquiry']), ease: f(['docOnly', 'noSystem']),
        handover: {
          decision: '届出書の世帯欄と転出証明書を見比べ、世帯の一部だけの転入か、世帯主が変わるかを最初に確かめる。どちらかに当てはまれば、入力の前に係長か経験者に声をかける。',
          reason: '世帯の一部だけの転入や世帯主の変更は、入力の順番を誤ると後で修正の届出が要り、住民の方に再来庁をお願いすることになる。',
          whyNot: '入力しながら判断する方法もあるが、窓口で待たせている間に修正が重なると時間がかかるため、先に確かめる。',
          exceptions: '外国人住民の転入、国外からの転入は、別の確認事項があるため手順書の別表を使う。',
          nonTransferable: '',
          steps: '1. 転出証明書と本人確認書類を確かめる\n2. 世帯の一部の転入か、世帯主が変わるかを確かめる\n3. 住民記録システムに入力する\n4. 関係課案内票で、該当する課に印を付けて渡す',
          updatedAt: '2026-10-25T09:00:00.000Z'
        }
      },
      {
        name: '窓口の待ち人数の集計', category: '集計', section: MADO, role: '副担当',
        procedure: '発券機の記録を手で書き写し、時間帯別の待ち人数を表計算に入力して課内に回覧する。',
        freqUnit: 'day', freqCount: 1, minutes: 20, casesPerMonth: 20, forms: '発券機の記録紙、表計算',
        issues: '書き写しと入力の二度手間。集計結果を使う場面が限られている。',
        kind: 'routine', need: 'need', ai: 'yes', transferSoon: 'no',
        burden: f(['daily', 'slow']), ease: f(['inSection', 'noOutside', 'noRule', 'noSystem', 'lowImpact'])
      },
      {
        name: '郵送請求の審査・発送', category: '審査', section: MADO, role: '郵送担当',
        procedure: '郵送で届いた請求書の記載・本人確認書類の写し・定額小為替を確認し、発行した証明書を返信用封筒で発送する。',
        freqUnit: 'day', freqCount: 15, minutes: 6, casesPerMonth: 300, calcMode: 'cases', minutesPerCase: 6, forms: '郵送請求書、定額小為替、住民記録システム、発送簿',
        issues: '記載不備の問い合わせ（電話・文書）で処理が止まる。担当が少なく休むと滞留する。',
        kind: 'routine', need: 'need', ai: 'unknown', transferSoon: 'no',
        burden: f(['daily', 'slow', 'pressure']), ease: f(['inSection', 'noOutside', 'noRule', 'docOnly']),
        improve: imp([6, 9, 12, 2, 'no'], [4, 6, 3, 5, 'yes'], 'ホームページの記入例を見直し、審査の確認項目をチェックシート化。手順書を作成し担当を増やした')
      }
    ];
    var stamp = '2026-10-01T09:00:00.000Z';
    tasks.forEach(function (t, i) { t.id = 'sample' + (i + 1); t.createdAt = stamp; t.updatedAt = stamp; });
    return {
      tasks: tasks,
      sections: [
        { id: 'sec1', section: KAIKEI, beforePeriod: '2025年10月', beforeHours: 96, beforePeople: 5, afterPeriod: '2026年10月', afterHours: 58, afterPeople: 3, note: '' },
        { id: 'sec2', section: MADO, beforePeriod: '2025年10月', beforeHours: 140, beforePeople: 7, afterPeriod: '2026年10月', afterHours: 112, afterPeople: 6, note: '' }
      ],
      settings: D.state.settings
    };
  }

  App.addToolbarItem(function (bar) {
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'btn-sample';
    b.textContent = '見本データを読み込む';
    b.title = '架空の係（会計係・窓口係）の業務10件を表示します';
    b.onclick = function () {
      var msg = D.state.tasks.length
        ? 'いまブラウザ内にあるデータを、見本データ（架空の係の業務10件）で置き換えます。必要なら先に「JSONで書き出す」で控えを取ってください。置き換えますか。'
        : '見本データ（架空の係の業務10件）を読み込みます。';
      if (!confirm(msg)) return;
      D.replaceState(build());
      App.refresh();
    };
    bar.appendChild(b);
  });
  App.buildSample = build;
})();

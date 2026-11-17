// 首次使用的導覽卡：三句話講完輸入分工與核心流程。關掉後記在 localStorage，
// 之後可從右上角的「?」重開。

import { useState } from 'react'

const STORAGE_KEY = 'hephcad-welcome-seen'

function seen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const TIPS: [string, string][] = [
  ['筆畫圖與選取', 'Apple Pencil（或滑鼠）畫線、點選、拖箭頭。'],
  ['手指移動視角', '單指旋轉、雙指平移與縮放；兩指點一下復原、三指重做。'],
  ['選了就能改', '點區域拖箭頭擠出；點邊拖箭頭圓角/倒角；雙擊選整個本體。'],
  ['輸入精確數字', '拖完後點畫面上的尺寸標籤，直接打數值。'],
]

export function WelcomeCard() {
  const [open, setOpen] = useState(() => !seen())
  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // 無痕模式等存不了：這次關掉就好
    }
  }
  if (!open) {
    return (
      <button className="help-button" aria-label="操作說明" title="操作說明" onClick={() => setOpen(true)}>
        ?
      </button>
    )
  }
  return (
    <div className="welcome-card" role="dialog" aria-label="操作說明">
      <h2>HephCAD 怎麼用</h2>
      <dl>
        {TIPS.map(([title, body]) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>{body}</dd>
          </div>
        ))}
      </dl>
      <button className="welcome-close" onClick={close}>
        開始
      </button>
    </div>
  )
}

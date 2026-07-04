# ADR 0004：Viewport 與 React 的邊界

日期：2026-07-03　狀態：已接受

## 決策

- Three.js 場景、render loop、相機、手勢、選取高亮全部在純 TS class（`src/viewport/`）內管理，**不使用** react-three-fiber，React 不進 render loop。
- React 只負責面板/工具列/chips 等 2D UI；`ViewportCanvas` 元件僅在 mount/unmount 時建立與銷毀 `Viewport`。
- 兩邊透過 Zustand store 溝通：viewport 寫入選取狀態等，UI 訂閱；UI 下的指令（切換工具、snap 開關）由 viewport 訂閱 store 或經明確方法呼叫。
- render loop 採 on-demand（invalidate 旗標 + 阻尼動畫），iPad 上省電。

## 理由

CAD viewport 的互動（拖曳擠出、snapping 預覽）需要每幀命令式控制，經 React reconciliation 只會增加延遲與 GC 壓力；r3f 的宣告式模型不適合這類工具型互動。

const ACTION_LABELS: Record<string, string> = {
  intro: "入场",
  idle: "待机",
  walk_left: "向左散步",
  walk_right: "向右散步",
  sleep: "睡觉",
  drag_hold: "被拎起",
  fall: "下落",
  land: "落地",
  tap_react: "点击反馈",
  feed_react: "文件投喂",
  curious: "好奇观察",
  edge_play: "屏幕边缘玩耍",
  quiet_idle: "安静待机",
  rare_1: "纸团招牌动作",
  rare_2: "滑倒招牌动作",
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}


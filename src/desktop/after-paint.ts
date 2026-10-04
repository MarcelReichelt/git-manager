type PaintTask = () => void;

let schedulePaint: (task: PaintTask) => void = (task) => {
  setTimeout(task, 0);
};

export function runAfterPaint(task: PaintTask): void {
  schedulePaint(task);
}

export function setAfterPaintScheduler(schedule: (task: PaintTask) => void): void {
  schedulePaint = schedule;
}

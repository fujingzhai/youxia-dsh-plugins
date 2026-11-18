// 与 DSH 的执行顺序一致：按提交顺序准备和结算，只有已获准并发的工具正文可以重叠。
export class DispatchQueue {
  constructor(maxParallel) {
    this.maxParallel = maxParallel
    this.active = new Set()
    this.admission = Promise.resolve()
    this.committed = Promise.resolve()
  }

  submit(classify, start, finish, signal) {
    const admitted = this.admission.then(async () => {
      signal.throwIfAborted()
      while (this.active.size >= this.maxParallel) await Promise.race(this.active)
      signal.throwIfAborted()
      const parallel = classify() === 'parallel'
      if (!parallel) await this.committed
      signal.throwIfAborted()
      // start 完成审批再返回，body 已开始，可以和下一项的准备重叠。
      const { body, prepared } = await start()
      const settled = Promise.allSettled([this.committed, body]).then(([, outcome]) => {
        if (outcome.status === 'rejected') throw outcome.reason
        return finish(prepared, outcome.value)
      })
      // body 由宿主管线结算；把错误也观察到，后续调用仍能排队。
      const released = settled.then(() => {}, () => {}).finally(() => this.active.delete(released))
      this.active.add(released)
      this.committed = released
      return { settled, barrier: parallel ? undefined : released }
    })
    this.admission = admitted.then(slot => slot.barrier, () => {})
    return admitted.then(slot => slot.settled)
  }

  async drain() {
    await this.admission
    await this.committed
  }
}

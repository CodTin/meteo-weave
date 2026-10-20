import { expect, test } from './browser-guard'
import { signInDemo } from './demo-login'

const pairPath = `/tasks/compare?${new URLSearchParams({
  a: 'demo-v1:researcher:alpine-temperature',
  b: 'demo-v1:researcher:coastal-wind',
})}`

test('retry recovers a comparison after a transient native task-storage read abort', async ({
  context,
  page,
}) => {
  await signInDemo(context)
  await page.goto(pairPath)
  const identities = page.getByRole('region', { name: '对比任务身份', exact: true })
  await expect(identities).toContainText('A · Synthetic Demo · Alpine mountain temperature')
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(2)

  // A one-shot failure at the native browser storage boundary, not task/cache state.
  // Restore the environment immediately: Retry must repair the latched service as well.
  await page.evaluate(() => {
    const read = IDBObjectStore.prototype.get
    IDBObjectStore.prototype.get = function (key) {
      const request = read.call(this, key)
      IDBObjectStore.prototype.get = read
      this.transaction.abort()
      return request
    }
    window.dispatchEvent(new Event('focus'))
  })
  await expect(page.getByRole('alert')).toContainText('无法读取当前账号的任务或结果')
  await expect(identities).toHaveCount(0)
  await expect(page.getByRole('table')).toHaveCount(0)
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(0)
  await page.getByRole('button', { name: '重新读取对比', exact: true }).click()
  await expect(identities).toContainText('A · Synthetic Demo · Alpine mountain temperature')
  await expect(identities).toContainText('B · Synthetic Demo · Coastal plain wind ensemble')
  await expect(page.getByRole('img', { name: /实际样本空间场/ })).toHaveCount(2)
  await expect(page).toHaveURL(pairPath)
})

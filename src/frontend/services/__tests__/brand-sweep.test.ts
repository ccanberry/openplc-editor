import { brandText, startBrandSweep, stopBrandSweep } from '../brand-sweep'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('brand sweep', () => {
  afterEach(() => stopBrandSweep())

  it('names RoboPLC where a text says OpenPLC, the word only', () => {
    expect(brandText('OpenPLC Runtime v4')).toBe('RoboPLC Runtime v4')
    expect(brandText('libOpenPLCUserLib.a')).toBe('libOpenPLCUserLib.a')
  })

  it('rewrites shown text and attributes, now and later, but not code, inputs or the About notice', async () => {
    document.body.innerHTML =
      '<div id="a" title="OpenPLC board">OpenPLC Simulator</div>' +
      '<div class="monaco-editor"><span id="code">(* OpenPLC *)</span></div>' +
      '<div data-keep-brand=""><p id="notice">derived from OpenPLC v4</p></div>' +
      '<textarea id="t">OpenPLC</textarea>'
    startBrandSweep()
    expect(document.getElementById('a')!.textContent).toBe('RoboPLC Simulator')
    expect(document.getElementById('a')!.getAttribute('title')).toBe('RoboPLC board')
    expect(document.getElementById('code')!.textContent).toBe('(* OpenPLC *)')
    expect(document.getElementById('notice')!.textContent).toBe('derived from OpenPLC v4')
    expect((document.getElementById('t') as HTMLTextAreaElement).value).toBe('OpenPLC')

    const late = document.createElement('span')
    late.textContent = 'Connected to OpenPLC Runtime'
    document.body.appendChild(late)
    document.getElementById('a')!.firstChild!.nodeValue = 'OpenPLC again'
    await flush()
    expect(late.textContent).toBe('Connected to RoboPLC Runtime')
    expect(document.getElementById('a')!.textContent).toBe('RoboPLC again')
  })
})

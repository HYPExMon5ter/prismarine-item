/* eslint-env mocha */

const expect = require('expect').default
const { ProtoDef } = require('protodef')

// Encodes and decodes an item with the version's real Slot codec, as a set_slot packet would.
function slotCodec (version) {
  const protocol = require('minecraft-data')(version).protocol
  const proto = new ProtoDef(false)
  require('prismarine-nbt').addTypesToInterpreter('big', proto)
  proto.addProtocol(protocol, ['play', 'toClient'])
  return {
    roundTrip (notch) {
      const buffer = proto.createPacketBuffer('Slot', notch)
      const { data, metadata } = proto.parsePacketBuffer('Slot', buffer)
      expect(metadata.size).toBe(buffer.length)
      return data
    }
  }
}

for (const version of ['1.20.5', '1.21.4', '1.21.5', '1.21.11']) {
  describe(`component-backed item edits ${version}`, () => {
    const registry = require('prismarine-registry')(version)
    const Item = require('prismarine-item')(registry)
    const codec = slotCodec(version)
    const sent = item => Item.fromNotch(codec.roundTrip(Item.toNotch(item)))

    it('reads and writes the enchantments of tools', () => {
      const sword = new Item(registry.itemsByName.diamond_sword.id, 1)
      sword.enchants = [{ name: 'sharpness', lvl: 5 }, { name: 'unbreaking', lvl: 3 }]
      const received = sent(sword)
      expect(received.enchants).toStrictEqual([{ name: 'sharpness', lvl: 5 }, { name: 'unbreaking', lvl: 3 }])
      expect(received.componentMap.has('stored_enchantments')).toBe(false)
    })

    it('keeps the enchantments of books in stored_enchantments', () => {
      const book = new Item(registry.itemsByName.enchanted_book.id, 1)
      book.enchants = [{ name: 'efficiency', lvl: 4 }]
      const received = sent(book)
      expect(received.enchants).toStrictEqual([{ name: 'efficiency', lvl: 4 }])
      expect(received.componentMap.has('enchantments')).toBe(false)
    })

    it('replaces and clears enchantments', () => {
      const sword = new Item(registry.itemsByName.diamond_sword.id, 1)
      sword.enchants = [{ name: 'sharpness', lvl: 1 }]
      sword.enchants = [{ name: 'looting', lvl: 2 }]
      expect(sent(sword).enchants).toStrictEqual([{ name: 'looting', lvl: 2 }])
      sword.enchants = []
      expect(sent(sword).enchants).toStrictEqual([])
      expect(sword.components.filter(c => c.type === 'enchantments')).toStrictEqual([])
    })

    it('keeps an item edited after it was received', () => {
      const sword = new Item(registry.itemsByName.diamond_sword.id, 1)
      sword.enchants = [{ name: 'sharpness', lvl: 1 }]
      const received = sent(sword)
      received.enchants = [...received.enchants, { name: 'unbreaking', lvl: 2 }]
      received.repairCost = 3
      const again = sent(received)
      expect(again.enchants).toStrictEqual([{ name: 'sharpness', lvl: 1 }, { name: 'unbreaking', lvl: 2 }])
      expect(again.repairCost).toBe(3)
    })

    it('sends the repair cost', () => {
      const sword = new Item(registry.itemsByName.diamond_sword.id, 1)
      sword.repairCost = 7
      expect(sent(sword).repairCost).toBe(7)
    })

    it('rejects unknown enchantment names', () => {
      const sword = new Item(registry.itemsByName.diamond_sword.id, 1)
      expect(() => { sword.enchants = [{ name: 'no_such_enchantment', lvl: 1 }] }).toThrow(/Unknown enchantment/)
    })
  })
}

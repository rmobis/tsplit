import { sendEmbed } from '../utils/helpers.ts';
import { botCache, Message } from '../../deps.ts';
import { Embed } from '../utils/Embed.ts';

const PARTY_HUNT_REGEX = /^(?<name>.+?)(?<leader> \(Leader\))?\n\s+Loot: (?<loot>.+)\n\s+Supplies: (?<sup>.+)\n\s+Balance: (?<blnc>.+)\n\s+Damage: (?<dmg>.+)\n\s+Healing: (?<heal>.+)$/gm;

interface PlayerStats {
	name: string;
	isLeader: boolean;
	loot: number;
	supplies: number;
	balance: number;
	damage: number;
	healing: number;
	restitution: number;
}

function parseNumber(str: string | undefined): number {
	if (str === undefined) {
		return 0;
	}

	return parseInt(str.replaceAll(',', ''), 10);
}

function buildField(trans: Map<string, number>): string {
	let transferMsgs = [];

	for (const [key, value] of trans.entries()) {
		transferMsgs.push(`transfer ${value} to ${key}`);
	}

	return transferMsgs.join('\n');
}

botCache.monitors.set('balanceCalculator', {
	name: 'balanceCalculator',
	ignoreDM: false,
	// deno-lint-ignore require-await
	execute: async function (message: Message) {
		// If the message was sent by a bot we can just ignore it
		if (message.author.bot) return;

		let matches = message.content.matchAll(PARTY_HUNT_REGEX);
		let players: PlayerStats[] = [];
		for (const m of matches) {
			players.push({
				name: m.groups?.name || '',
				isLeader: !!m.groups?.leader,
				loot: parseNumber(m.groups?.loot),
				supplies: parseNumber(m.groups?.sup),
				balance: parseNumber(m.groups?.blnc),
				damage: parseNumber(m.groups?.dmg),
				healing: parseNumber(m.groups?.heal),
				restitution: 0,
			});
		}

		if (players.length === 0) {
			return;
		}

		const partyBalance = players.reduce((memo, v) => v.balance + memo, 0);
		const sortedPlayers = players
			.map((v) => {
				return {
					...v,
					restitution: Math.trunc(partyBalance / players.length - v.balance),
				};
			})
			.sort((a, b) => a.restitution - b.restitution);

		const embed = new Embed().setTitle('Party Hunt Results #00').setColor('#198754');

		console.log(sortedPlayers);

		for (const player of sortedPlayers) {
			if (player.restitution >= 0) continue;

			let transactions = new Map<string, number>();

			for (const rplayer of sortedPlayers.reverse()) {
				if (rplayer.restitution <= 0) {
					continue;
				}

				const transAmount = Math.min(-player.restitution, rplayer.restitution);
				player.restitution += transAmount;
				rplayer.restitution -= transAmount;

				transactions.set(rplayer.name, transAmount);

				if (player.restitution === 0) {
					break;
				}
			}

			embed.addField((player.isLeader ? '👑 ' : '') + player.name, buildField(transactions));
		}

		sendEmbed(message.channelID, embed);
	},
});

import { sendEmbed } from '../utils/helpers.ts';
import { botCache, Message } from '../../deps.ts';
import { Embed } from '../utils/Embed.ts';

const PARTY_HUNT_REGEX = /^(?<name>.+?)(?<leader> \(Leader\))?\n\s+Loot: (?<loot>.+)\n\s+Supplies: (?<sup>.+)\n\s+Balance: (?<blnc>.+)\n\s+Damage: (?<dmg>.+)\n\s+Healing: (?<heal>.+)$/gm;

interface PlayerStats {
	name: string;
	isLeader: boolean;
	loot: number;
	supplies: number;
	restitution: number;
}

function parseNumber(str: string | undefined): number {
	if (str === undefined) {
		return 0;
	}

	return parseInt(str.replaceAll(',', ''), 10);
}

function buildField(transfers: Record<string, number>): string {
	let transferMsgs = [];

	for (const [key, value] of Object.entries(transfers)) {
		transferMsgs.push(`transfer ${value} to ${key}`);
	}

	return transferMsgs.join('\n');
}

function parseSessionData(message: string): Record<string, any>[] {
	let players: Record<string, any>[] = [];
	let matches = message.matchAll(PARTY_HUNT_REGEX);

	for (const m of matches) {
		players.push({
			name: m.groups?.name || '',
			isLeader: !!m.groups?.leader,
			loot: parseNumber(m.groups?.loot),
			supplies: parseNumber(m.groups?.sup),
			restitution: 0,
		});
	}

	return players;
}

function roundToNearestMultiple(n: number, mul: number) {
	return Math.round(n / mul) * mul;
}

function preprocessData(data: Record<string, any>[]): Record<string, any>[] {
	data = data
		.map((v) => ({
			...v,
			loot: roundToNearestMultiple(v.loot, data.length),
			supplies: roundToNearestMultiple(v.supplies, data.length),
		}))
		.map((v) => ({
			...v,
			balance: v.loot - v.supplies,
		}));

	const splitBalance = data.reduce((memo, v) => memo + v.balance, 0) / data.length;

	return data
		.map((v) => ({
			...v,
			restitution: splitBalance - v.balance,
		}))
		.sort((a, b) => a.restitution - b.restitution);
}

function buildTransfers(data: Record<string, any>[]) {
	for (const player of data) {
		if (player.restitution >= 0) continue;

		player.transfers = {};

		for (const rplayer of [...data].reverse()) {
			if (rplayer.restitution <= 0) {
				continue;
			}

			const transAmount = Math.min(-player.restitution, rplayer.restitution);
			player.restitution += transAmount;
			rplayer.restitution -= transAmount;

			player.transfers[rplayer.name] = transAmount;

			if (player.restitution === 0) {
				break;
			}
		}
	}
}

function buildEmbed(data: Record<string, any>[]): Embed {
	const embed = new Embed().setTitle('Party Hunt Results #00').setColor('#198754');

	for (const player of data) {
		if (!player.transfers) {
			continue;
		}

		embed.addField((player.isLeader ? '👑 ' : '') + player.name, buildField(player.transfers));
	}

	return embed;
}

botCache.monitors.set('balanceCalculator', {
	name: 'balanceCalculator',
	ignoreDM: false,
	// deno-lint-ignore require-await
	execute: async function (message: Message) {
		// If the message was sent by a bot we can just ignore it
		if (message.author.bot) return;

		let players = parseSessionData(message.content);
		if (players.length === 0) {
			return;
		}

		let data = preprocessData(players);
		buildTransfers(data);
		const embed = buildEmbed(data);
		sendEmbed(message.channelID, embed);
	},
});

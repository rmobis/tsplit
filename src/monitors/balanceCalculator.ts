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
	const numOfPlayers = data.length;

	data = data
		.map((v) => ({
			...v,
			pLoot: v.loot * numOfPlayers,
			pSupplies: v.supplies * numOfPlayers,
		}))
		.map((v) => ({
			...v,
			pBalance: v.pLoot - v.pSupplies,
		}));

	const splitBalance = data.reduce((memo, v) => memo + v.pBalance, 0) / numOfPlayers;

	let carryDiff = 0;
	return data
		.map((v) => ({
			...v,
			pRestitution: splitBalance - v.pBalance,
		}))
		.map((v) => {
			const localDiff = v.pRestitution - roundToNearestMultiple(v.pRestitution, numOfPlayers);
			const localFix = roundToNearestMultiple(carryDiff + localDiff, numOfPlayers);
			carryDiff -= localFix;

			return {
				...v,
				ppRestitution: (v.pRestitution - localDiff + localFix) / numOfPlayers,
			};
		})
		.sort((a, b) => a.ppRestitution - b.ppRestitution);
}

function buildTransfers(data: Record<string, any>[]) {
	for (const player of data) {
		if (player.ppRestitution >= 0) continue;

		player.transfers = {};

		for (const rplayer of [...data].reverse()) {
			if (rplayer.ppRestitution <= 0) {
				continue;
			}

			const transAmount = Math.min(-player.ppRestitution, rplayer.ppRestitution);
			player.ppRestitution += transAmount;
			rplayer.ppRestitution -= transAmount;

			player.transfers[rplayer.name] = transAmount;

			if (player.ppRestitution === 0) {
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

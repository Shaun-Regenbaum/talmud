import { storeText, getText } from '$lib/sefaria';
import { groupTexts, getLength } from '$lib/textManipulation';
import { WholeBook as Book } from '$lib/MishnehTorah';
import { json } from '@sveltejs/kit';
import { redis, resetIndices, redisConnect, redisReconnect } from '$lib/db';

export async function GET() {
	let status: string[] = [];

	status = await redisConnect(redis, status);

	await resetIndices()
		.then(() => {
			status.push('Reset indices');
			console.log('Reset indices');
		})
		.catch(() => {
			console.log('Error resetting indices');
			status.push('Error resetting indices');
		});

	let singles = [];
	let groups = [];

	try {
		status.push('Length to iterate through' + String(Book.length));
		console.log('Length to iterate through' + String(Book.length));
		for (let i = 0; i < Book.length; i++) {
			console.log(`Working on ${i}/${Book.length}`);
			let length = await getLength(`Mishneh Torah, ${Book[Number(i)]}`).catch(
				(e) => {
					console.log(`Error getting length for ${Book[i]}`);
					console.log(e);
					return 0;
				}
			);

			status.push(`There are ${length} parts for ${Book[i]}`);

			for (let j = 0; j < Number(length); j++) {
				try {
					singles.push(
						await getText(`Mishneh Torah, ${Book[i]}`, String(j + 1))
					);
					console.log(`Got text ${j} of ${Book[i]}`);
					if (singles[j] === undefined) {
						console.log(`Got undefined for ${j} of ${Book[i]}`);
						status.push(`Got undefined for ${j} of ${Book[i]}`);
					}
					groups.push(await groupTexts(2, singles[j]));
					console.log(`Grouped text ${j} of ${Book[i]}`);
				} catch (e) {
					console.log(`Error getting text ${j} of ${Book[i]}`);
					console.log(e);
					status = await redisReconnect(redis, status);
				}
			}
			console.log('Length of meta groups: ' + groups.length);
			for (let q = 0; q < groups.length; q++) {
				for (let w = 0; w < groups[q].length; w++) {
					try {
						await storeText(groups[q][w]);
						console.log(
							`Stored text ${q},${w} / ${groups.length}, ${groups[q].length} of ${Book[i]}`
						);
						status.push(
							`Stored text ${q},${w} / ${groups.length}, ${groups[q].length} of ${Book[i]}`
						);
					} catch (e) {
						console.log(
							`Error storing text ${q},${w} / ${groups.length}, ${groups[q].length} of ${Book[i]}`
						);
						console.log(e);
						status = await redisReconnect(redis, status);
					}
				}
			}
			console.log(`Finished ${i}/${Book.length}`);
		}
	} catch (e) {
		console.log('Error in main loop');
		console.log(e);
		status.push('Error in main loop');
		status = await redisReconnect(redis, status);
	}
	await redis.quit();
	return json(status);
}

import { Emitter } from '../model/emitter.ts';
import type { Notice, NoticesPort } from '../model/types.ts';
import type { Clock } from './clock.ts';

export type NoticeScenario = 'storage' | 'mixed' | 'fail';

export const noticeFixtures: Record<'storage' | 'welcome', Notice> = {
  storage: {
    id: 'storage',
    tone: 'warning',
    title: 'Your files may be cleared',
    body: 'This browser may clear seven’s files and chats when the disk runs low on space. Bookmarking this page makes that less likely.',
    actions: [{ id: 'retry', label: 'Try again' }],
  },
  welcome: {
    id: 'welcome',
    tone: 'info',
    title: 'Everything stays in this browser',
    body: 'Seven keeps your files and chats on this computer. Nothing is uploaded unless you send it.',
    actions: [],
  },
};

export class DummyNotices extends Emitter<{ notices: readonly Notice[] }> implements NoticesPort {
  #scenario: NoticeScenario;
  #time: Clock;
  #notices: readonly Notice[];

  constructor(scenario: NoticeScenario, time: Clock) {
    super();
    this.#scenario = scenario;
    this.#time = time;
    this.#notices =
      scenario === 'mixed'
        ? [noticeFixtures.storage, noticeFixtures.welcome]
        : [noticeFixtures.storage];
  }

  list(): readonly Notice[] {
    return this.#notices;
  }

  async act(id: string, action: string): Promise<void> {
    await this.#time.sleep(10);
    if (this.#scenario === 'fail') {
      throw new Error('The browser declined again. Bookmark this page, then try again.');
    }
    if (id === 'storage' && action === 'retry') this.#remove(id);
  }

  dismiss(id: string): void {
    this.#remove(id);
  }

  #remove(id: string): void {
    this.#notices = this.#notices.filter((notice) => notice.id !== id);
    this.emit('notices', this.#notices);
  }
}

import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';

import { isNonProductionEnvironment } from 'loot-core/src/shared/environment';

import { type CommonModalProps } from '../../types/modals';
import Modal from '../common/Modal';
import ManageRules from '../ManageRules';

type ManageRulesModalProps = {
  modalProps: CommonModalProps;
  payeeId?: string;
};

export default function ManageRulesModal({
  modalProps,
  payeeId,
}: ManageRulesModalProps) {
  const [loading, setLoading] = useState(true);
  const location = useLocation();
  if (isNonProductionEnvironment()) {
    if (location.pathname !== '/payees') {
      throw new Error(
        `Possibly invalid use of ManageRulesModal, add the current url \`${location.pathname}\` to the allowlist if you’re confident the modal can never appear on top of the \`/rules\` page.`,
      );
    }
  }

  return (
    <Modal
      title="Rules"
      padding={0}
      loading={loading}
      {...modalProps}
      style={{
        flex: 1,
      }}
    >
      {() => <ManageRules isModal payeeId={payeeId} setLoading={setLoading} />}
    </Modal>
  );
}

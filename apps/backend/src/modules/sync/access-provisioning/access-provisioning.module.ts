import { Module } from '@nestjs/common'
import { AccessProvisioningService } from './access-provisioning.service'
import { TotvsModule } from '../../integrations/totvs/totvs.module'
import { GoogleModule } from '../../integrations/google/google.module'

@Module({
  imports: [TotvsModule, GoogleModule],
  providers: [AccessProvisioningService],
  exports: [AccessProvisioningService],
})
export class AccessProvisioningModule {}
